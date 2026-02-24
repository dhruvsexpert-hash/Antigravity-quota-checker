import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as url from 'url';

// --- Constants (from Antigravity source) ---
const GOOGLE_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
];

const TOKEN_KEY = 'antigravity-quota-tokens';

interface TokenData {
    access_token: string;
    refresh_token: string;
    expires_at: number;
}

/**
 * Handles Google OAuth2 with PKCE for the VS Code extension.
 * Uses a local HTTP server to receive the callback.
 */
export class AuthManager {
    private tokenData: TokenData | null = null;
    private secrets: vscode.SecretStorage;
    private log: vscode.OutputChannel;
    private _onDidChangeAuth = new vscode.EventEmitter<boolean>();
    readonly onDidChangeAuth = this._onDidChangeAuth.event;

    constructor(secrets: vscode.SecretStorage, log: vscode.OutputChannel) {
        this.secrets = secrets;
        this.log = log;
    }

    async initialize(): Promise<void> {
        const stored = await this.secrets.get(TOKEN_KEY);
        if (stored) {
            try {
                this.tokenData = JSON.parse(stored);
                this.log.appendLine(`[Auth] Loaded tokens from SecretStorage (expires_at: ${this.tokenData?.expires_at})`);
            } catch {
                this.log.appendLine('[Auth] Failed to parse stored tokens');
                this.tokenData = null;
            }
        } else {
            this.log.appendLine('[Auth] No stored tokens found');
        }
    }

    get isAuthenticated(): boolean {
        return this.tokenData !== null && !!this.tokenData.refresh_token;
    }

    /**
     * Get a valid access token, refreshing if needed.
     */
    async getAccessToken(): Promise<string | null> {
        if (!this.tokenData) {
            this.log.appendLine('[Auth] getAccessToken: no tokenData');
            return null;
        }

        // If token is still valid (with 60s buffer)
        if (this.tokenData.access_token && this.tokenData.expires_at > Date.now() / 1000 + 60) {
            return this.tokenData.access_token;
        }

        this.log.appendLine('[Auth] Access token expired, attempting refresh...');

        // Try to refresh
        if (this.tokenData.refresh_token) {
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
                this.log.appendLine('[Auth] Token refreshed successfully');
                return this.tokenData!.access_token;
            }
        }

        this.log.appendLine('[Auth] Could not obtain valid access token');
        return null;
    }

    /**
     * Start the OAuth login flow. Opens a browser and spins up a temporary
     * local HTTP server on a random port to catch the redirect.
     */
    async login(): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            // Generate PKCE values
            const verifier = crypto.randomBytes(64).toString('base64url');
            const challenge = crypto
                .createHash('sha256')
                .update(verifier)
                .digest('base64url');

            const state = crypto.randomBytes(16).toString('hex');

            // Create a temporary local HTTP server for the OAuth callback
            const server = http.createServer(async (req, res) => {
                if (!req.url) {
                    return;
                }

                const parsed = url.parse(req.url, true);
                if (parsed.pathname !== '/callback') {
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }

                const code = parsed.query['code'] as string;
                const returnedState = parsed.query['state'] as string;
                const error = parsed.query['error'] as string;

                if (error) {
                    this.log.appendLine(`[Auth] OAuth error from Google: ${error}`);
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(this.buildHtmlResponse('Authentication Failed', `Google returned error: ${error}`, false));
                    server.close();
                    resolve(false);
                    return;
                }

                if (!code || returnedState !== state) {
                    this.log.appendLine(`[Auth] Callback: state mismatch or missing code`);
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(this.buildHtmlResponse('Authentication Failed', 'State mismatch or missing code. Please try again.', false));
                    server.close();
                    resolve(false);
                    return;
                }

                try {
                    const port = (server.address() as any).port;
                    const redirectUri = `http://127.0.0.1:${port}/callback`;
                    this.log.appendLine(`[Auth] Exchanging code for tokens (redirect: ${redirectUri})`);
                    await this.exchangeCodeForTokens(code, redirectUri, verifier);

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(this.buildHtmlResponse('Authentication Successful!', 'You can close this tab and return to VS Code.', true));

                    this.log.appendLine('[Auth] Sign-in complete! Tokens persisted.');
                    this._onDidChangeAuth.fire(true);
                    server.close();
                    resolve(true);
                } catch (err: any) {
                    this.log.appendLine(`[Auth] Token exchange failed: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(this.buildHtmlResponse('Authentication Error', err.message || 'Unknown error', false));
                    server.close();
                    resolve(false);
                }
            });

            // Listen on a random port
            server.listen(0, '127.0.0.1', () => {
                const port = (server.address() as any).port;
                const redirectUri = `http://127.0.0.1:${port}/callback`;

                this.log.appendLine(`[Auth] Local callback server on port ${port}`);

                const authUrl =
                    `${GOOGLE_AUTH_ENDPOINT}?` +
                    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
                    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                    `response_type=code&` +
                    `scope=${encodeURIComponent(GOOGLE_SCOPES.join(' '))}&` +
                    `state=${state}&` +
                    `code_challenge=${challenge}&` +
                    `code_challenge_method=S256&` +
                    `access_type=offline&` +
                    `prompt=consent`;

                vscode.env.openExternal(vscode.Uri.parse(authUrl));
            });

            // Auto-close server after 2 minutes if no callback received
            setTimeout(() => {
                this.log.appendLine('[Auth] Login timeout (2 minutes)');
                server.close();
                resolve(false);
            }, 120_000);
        });
    }

    /**
     * Exchange authorization code for access + refresh tokens.
     */
    private async exchangeCodeForTokens(code: string, redirectUri: string, verifier: string): Promise<void> {
        const body = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier,
        });

        const data = await this.httpPost(GOOGLE_TOKEN_ENDPOINT, body.toString(), 'application/x-www-form-urlencoded');

        this.tokenData = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || (this.tokenData?.refresh_token ?? ''),
            expires_at: Date.now() / 1000 + data.expires_in,
        };

        await this.persistTokens();
    }

    /**
     * Refresh the access token using the stored refresh token.
     * Only logs out on definitive auth errors (invalid_grant), NOT network errors.
     */
    private async refreshAccessToken(): Promise<boolean> {
        if (!this.tokenData?.refresh_token) {
            return false;
        }

        try {
            const body = new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: this.tokenData.refresh_token,
                grant_type: 'refresh_token',
            });

            const data = await this.httpPost(GOOGLE_TOKEN_ENDPOINT, body.toString(), 'application/x-www-form-urlencoded');

            this.tokenData.access_token = data.access_token;
            this.tokenData.expires_at = Date.now() / 1000 + data.expires_in;
            await this.persistTokens();
            return true;
        } catch (err: any) {
            const msg = err.message || '';
            this.log.appendLine(`[Auth] Token refresh failed: ${msg}`);

            // Only logout on definitive auth errors (invalid_grant, invalid_client)
            // Network errors should NOT clear stored tokens
            if (msg.includes('invalid_grant') || msg.includes('invalid_client') || msg.includes('401')) {
                this.log.appendLine('[Auth] Refresh token is invalid — clearing credentials');
                await this.logout();
            } else {
                this.log.appendLine('[Auth] Transient error — keeping tokens for retry');
            }
            return false;
        }
    }

    async logout(): Promise<void> {
        this.log.appendLine('[Auth] Logging out');
        // Best-effort revocation
        if (this.tokenData?.access_token) {
            try {
                await this.httpPost(
                    `https://oauth2.googleapis.com/revoke?token=${this.tokenData.access_token}`,
                    '',
                    'application/x-www-form-urlencoded'
                );
            } catch {
                // ignore
            }
        }

        this.tokenData = null;
        await this.secrets.delete(TOKEN_KEY);
        this._onDidChangeAuth.fire(false);
    }

    private async persistTokens(): Promise<void> {
        if (this.tokenData) {
            await this.secrets.store(TOKEN_KEY, JSON.stringify(this.tokenData));
        }
    }

    /**
     * Simple HTTPS POST helper — no external dependencies.
     */
    private httpPost(endpoint: string, body: string, contentType: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(endpoint);
            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': Buffer.byteLength(body),
                },
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve(data);
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    private buildHtmlResponse(title: string, message: string, success: boolean): string {
        const color = success ? '#34d399' : '#f87171';
        const icon = success ? '✅' : '❌';
        return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #0a0e1a; color: #f1f5f9; }
  .card { text-align: center; padding: 3rem; border-radius: 20px;
          background: rgba(17,24,39,0.8); border: 1px solid ${color}40;
          box-shadow: 0 0 40px ${color}20; }
  h1 { color: ${color}; margin: 0.5rem 0; }
  p { color: #94a3b8; }
</style></head>
<body><div class="card"><div style="font-size:3rem">${icon}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
    }
}
