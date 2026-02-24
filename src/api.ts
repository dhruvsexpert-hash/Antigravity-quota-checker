import * as vscode from 'vscode';
import * as https from 'https';
import { AuthManager } from './auth';

const CLOUD_CODE_API_BASE = 'https://cloudcode-pa.googleapis.com';
const LOAD_CODE_ASSIST_PATH = '/v1internal:loadCodeAssist';
const FETCH_AVAILABLE_MODELS_PATH = '/v1internal:fetchAvailableModels';

export interface ModelQuota {
    displayName: string;
    remainingPercent: number;
    resetText: string;
}

export interface QuotaData {
    tier: string | null;
    models: Record<string, ModelQuota>;
}

/**
 * Calls the Cloud Code API to fetch project info and model quotas.
 */
export class QuotaApi {
    constructor(private authManager: AuthManager, private log: vscode.OutputChannel) { }

    async fetchQuota(): Promise<QuotaData | null> {
        const accessToken = await this.authManager.getAccessToken();
        if (!accessToken) {
            return null;
        }

        // Step 1: Get project ID and tier
        this.log.appendLine('[API] Calling loadCodeAssist...');
        const projectInfo = await this.apiPost(
            `${CLOUD_CODE_API_BASE}${LOAD_CODE_ASSIST_PATH}`,
            {
                metadata: {
                    ideType: 'ANTIGRAVITY',
                    platform: 'PLATFORM_UNSPECIFIED',
                    pluginType: 'GEMINI',
                },
            },
            accessToken
        );

        const projectId = this.extractProjectId(projectInfo);
        const tier = this.extractTier(projectInfo);
        this.log.appendLine(`[API] Project: ${projectId}, Tier: ${tier}`);

        // Step 2: Fetch model quotas
        this.log.appendLine('[API] Calling fetchAvailableModels...');
        const body = projectId ? { project: projectId } : {};
        const modelsResponse = await this.apiPost(
            `${CLOUD_CODE_API_BASE}${FETCH_AVAILABLE_MODELS_PATH}`,
            body,
            accessToken
        );
        const rawModels = modelsResponse.models || {};

        const models: Record<string, ModelQuota> = {};
        for (const [name, info] of Object.entries(rawModels)) {
            const quotaInfo = (info as any).quotaInfo || {};
            let remaining = quotaInfo.remainingFraction;
            if (remaining === undefined || remaining === null) {
                remaining = 0;
            }
            const pct = remaining * 100;

            models[name] = {
                displayName: this.formatModelName(name),
                remainingPercent: Math.round(pct * 10) / 10,
                resetText: this.computeResetText(quotaInfo.resetTime),
            };
        }

        this.log.appendLine(`[API] Got ${Object.keys(models).length} models`);
        return { tier, models };
    }

    private extractProjectId(response: any): string | null {
        const cp = response?.cloudaicompanionProject;
        if (!cp) { return null; }
        if (typeof cp === 'string') { return cp; }
        if (typeof cp === 'object') { return cp.id || cp.projectId || null; }
        return null;
    }

    private extractTier(response: any): string | null {
        const paid = response?.paidTier || {};
        const current = response?.currentTier || {};
        const tier = paid.id || paid.name || current.id || current.name;
        if (tier) { return tier; }

        const allowed = response?.allowedTiers || [];
        for (const t of allowed) {
            if (t.isDefault && t.id) { return t.id; }
        }
        return allowed.length > 0 ? 'LEGACY' : null;
    }

    private formatModelName(name: string): string {
        const fixed = name.replace(/(\d+)-(\d+)/g, '$1.$2');
        return fixed
            .split('-')
            .map((part: string) => {
                if (part && !/^\d/.test(part)) {
                    return part.charAt(0).toUpperCase() + part.slice(1);
                }
                return part;
            })
            .join(' ');
    }

    private computeResetText(resetTimeStr: string | null | undefined): string {
        if (!resetTimeStr) { return ''; }
        try {
            const resetTime = new Date(resetTimeStr);
            const now = new Date();
            const diffMs = resetTime.getTime() - now.getTime();

            if (diffMs <= 0) { return 'Resets very soon'; }

            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (days > 0) { return `Resets in ${days}d ${hours}h`; }
            if (hours > 0) { return `Resets in ${hours}h ${minutes}m`; }
            if (minutes > 0) { return `Resets in ${minutes}m`; }
            return 'Resets very soon';
        } catch {
            return `Reset: ${resetTimeStr}`;
        }
    }

    private apiPost(endpoint: string, body: any, accessToken: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const jsonBody = JSON.stringify(body);
            const parsed = new URL(endpoint);

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: 443,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'AntigravityQuotaVSCode/1.0',
                    'Content-Length': Buffer.byteLength(jsonBody),
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
                            resolve({});
                        }
                    } else {
                        this.log.appendLine(`[API] Error ${res.statusCode}: ${data.substring(0, 300)}`);
                        reject(new Error(`API error ${res.statusCode}: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', (err) => {
                this.log.appendLine(`[API] Network error: ${err.message}`);
                reject(err);
            });
            req.write(jsonBody);
            req.end();
        });
    }
}
