import * as vscode from 'vscode';
import { AuthManager } from './auth';
import { QuotaApi } from './api';
import { QuotaTreeDataProvider } from './quotaProvider';
import { StatusBarManager } from './statusBar';

let pollTimer: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext) {
    // --- Output channel for debugging ---
    const log = vscode.window.createOutputChannel('Antigravity Quota', { log: true });
    log.appendLine('Extension activating...');

    // --- Core services ---
    const authManager = new AuthManager(context.secrets, log);
    await authManager.initialize();

    const quotaApi = new QuotaApi(authManager, log);
    const treeProvider = new QuotaTreeDataProvider();
    const statusBar = new StatusBarManager();

    // --- Tree view ---
    const treeView = vscode.window.createTreeView('antigravityQuotaView', {
        treeDataProvider: treeProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // --- Auth state listener ---
    authManager.onDidChangeAuth((authenticated) => {
        log.appendLine(`[Main] Auth changed: ${authenticated}`);
        treeProvider.setAuthenticated(authenticated);
        if (authenticated) {
            statusBar.showLoading();
            refreshQuota();
            startPolling();
        } else {
            statusBar.showDisconnected();
            stopPolling();
        }
    });

    // Initialize UI state
    const isAuth = authManager.isAuthenticated;
    log.appendLine(`[Main] Initial auth state: ${isAuth}`);
    treeProvider.setAuthenticated(isAuth);
    if (isAuth) {
        statusBar.showLoading();
    }

    // --- Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-quota.signIn', async () => {
            log.appendLine('[Main] Sign-in command triggered');
            const success = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Antigravity Quota: Signing in...',
                    cancellable: false,
                },
                async () => {
                    return authManager.login();
                }
            );

            if (success) {
                vscode.window.showInformationMessage('Antigravity Quota: Signed in successfully!');
            } else {
                vscode.window.showErrorMessage('Antigravity Quota: Sign-in failed or timed out. Check "Antigravity Quota" output for details.');
            }
        }),

        vscode.commands.registerCommand('antigravity-quota.signOut', async () => {
            await authManager.logout();
            vscode.window.showInformationMessage('Antigravity Quota: Signed out.');
        }),

        vscode.commands.registerCommand('antigravity-quota.refresh', () => {
            if (!authManager.isAuthenticated) {
                vscode.commands.executeCommand('antigravity-quota.signIn');
                return;
            }
            refreshQuota();
        })
    );

    // --- Polling ---
    let consecutiveErrors = 0;

    async function refreshQuota() {
        treeProvider.setLoading(true);
        log.appendLine('[Main] Fetching quota...');

        try {
            const data = await quotaApi.fetchQuota();
            if (data) {
                consecutiveErrors = 0;
                treeProvider.update(data);
                statusBar.update(data);
                log.appendLine(`[Main] Quota updated: ${Object.keys(data.models).length} models`);
            } else {
                // null means no access token — user needs to re-authenticate
                log.appendLine('[Main] No access token available');
                treeProvider.setAuthenticated(false);
                statusBar.showDisconnected();
                stopPolling();
            }
        } catch (err: any) {
            consecutiveErrors++;
            const msg = err.message || 'Unknown error';
            log.appendLine(`[Main] Quota fetch error (${consecutiveErrors}): ${msg}`);
            treeProvider.setError(`Fetch failed. Click refresh to retry.`);
            statusBar.showError();

            // Don't kill polling on transient errors — just keep trying
            if (consecutiveErrors >= 5) {
                log.appendLine('[Main] Too many errors, stopping poll');
                stopPolling();
            }
        }
    }

    function startPolling() {
        stopPolling();
        const config = vscode.workspace.getConfiguration('antigravityQuota');
        const intervalSec = config.get<number>('pollIntervalSeconds', 30);
        log.appendLine(`[Main] Starting poll every ${intervalSec}s`);
        pollTimer = setInterval(refreshQuota, intervalSec * 1000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = undefined;
        }
    }

    // --- Kick off if already authenticated ---
    if (isAuth) {
        refreshQuota();
        startPolling();
    }

    // --- Cleanup ---
    context.subscriptions.push({
        dispose() {
            stopPolling();
            statusBar.dispose();
            log.dispose();
        },
    });

    log.appendLine('Extension activated');
}

export function deactivate() {
    if (pollTimer) {
        clearInterval(pollTimer);
    }
}
