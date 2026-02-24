"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const auth_1 = require("./auth");
const api_1 = require("./api");
const quotaProvider_1 = require("./quotaProvider");
const statusBar_1 = require("./statusBar");
let pollTimer;
async function activate(context) {
    // --- Output channel for debugging ---
    const log = vscode.window.createOutputChannel('Antigravity Quota', { log: true });
    log.appendLine('Extension activating...');
    // --- Core services ---
    const authManager = new auth_1.AuthManager(context.secrets, log);
    await authManager.initialize();
    const quotaApi = new api_1.QuotaApi(authManager, log);
    const treeProvider = new quotaProvider_1.QuotaTreeDataProvider();
    const statusBar = new statusBar_1.StatusBarManager();
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
        }
        else {
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
    context.subscriptions.push(vscode.commands.registerCommand('antigravity-quota.signIn', async () => {
        log.appendLine('[Main] Sign-in command triggered');
        const success = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Antigravity Quota: Signing in...',
            cancellable: false,
        }, async () => {
            return authManager.login();
        });
        if (success) {
            vscode.window.showInformationMessage('Antigravity Quota: Signed in successfully!');
        }
        else {
            vscode.window.showErrorMessage('Antigravity Quota: Sign-in failed or timed out. Check "Antigravity Quota" output for details.');
        }
    }), vscode.commands.registerCommand('antigravity-quota.signOut', async () => {
        await authManager.logout();
        vscode.window.showInformationMessage('Antigravity Quota: Signed out.');
    }), vscode.commands.registerCommand('antigravity-quota.refresh', () => {
        if (!authManager.isAuthenticated) {
            vscode.commands.executeCommand('antigravity-quota.signIn');
            return;
        }
        refreshQuota();
    }));
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
            }
            else {
                // null means no access token — user needs to re-authenticate
                log.appendLine('[Main] No access token available');
                treeProvider.setAuthenticated(false);
                statusBar.showDisconnected();
                stopPolling();
            }
        }
        catch (err) {
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
        const intervalSec = config.get('pollIntervalSeconds', 30);
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
function deactivate() {
    if (pollTimer) {
        clearInterval(pollTimer);
    }
}
//# sourceMappingURL=extension.js.map