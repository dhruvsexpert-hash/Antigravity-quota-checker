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
exports.QuotaTreeDataProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Tree data provider that shows Antigravity model quotas in the sidebar.
 */
class QuotaTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.data = null;
        this.authenticated = false;
        this.loading = false;
        this.errorMessage = null;
    }
    update(data) {
        this.data = data;
        this.errorMessage = null;
        this._onDidChangeTreeData.fire();
    }
    setAuthenticated(auth) {
        this.authenticated = auth;
        if (!auth) {
            this.data = null;
        }
        this._onDidChangeTreeData.fire();
    }
    setLoading(loading) {
        this.loading = loading;
        this._onDidChangeTreeData.fire();
    }
    setError(message) {
        this.errorMessage = message;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return []; // No nested children
        }
        if (!this.authenticated) {
            const item = new QuotaTreeItem('$(sign-in) Sign in to view quota', vscode.TreeItemCollapsibleState.None);
            item.command = {
                command: 'antigravity-quota.signIn',
                title: 'Sign In',
            };
            item.tooltip = 'Click to sign in with Google';
            return [item];
        }
        if (this.loading && !this.data) {
            return [new QuotaTreeItem('$(loading~spin) Loading quota...', vscode.TreeItemCollapsibleState.None)];
        }
        if (this.errorMessage) {
            const errItem = new QuotaTreeItem(`$(error) ${this.errorMessage}`, vscode.TreeItemCollapsibleState.None);
            return [errItem];
        }
        if (!this.data) {
            return [new QuotaTreeItem('$(info) No quota data yet', vscode.TreeItemCollapsibleState.None)];
        }
        const items = [];
        // Tier header
        if (this.data.tier) {
            const tierItem = new QuotaTreeItem(`$(star) Tier: ${this.data.tier}`, vscode.TreeItemCollapsibleState.None);
            tierItem.tooltip = `Current tier: ${this.data.tier}`;
            items.push(tierItem);
            // Separator
            const sep = new QuotaTreeItem('─'.repeat(30), vscode.TreeItemCollapsibleState.None);
            items.push(sep);
        }
        // Model entries
        const entries = Object.entries(this.data.models);
        if (entries.length === 0) {
            items.push(new QuotaTreeItem('$(info) No model data available', vscode.TreeItemCollapsibleState.None));
            return items;
        }
        // Sort: lowest quota first so critical models are visible
        entries.sort(([, a], [, b]) => a.remainingPercent - b.remainingPercent);
        for (const [, model] of entries) {
            const icon = this.getQuotaIcon(model.remainingPercent);
            const pctText = model.remainingPercent <= 0
                ? 'DEPLETED'
                : `${model.remainingPercent.toFixed(1)}%`;
            const item = new QuotaTreeItem(`${icon} ${model.displayName}  —  ${pctText}`, vscode.TreeItemCollapsibleState.None);
            // Build a rich tooltip
            const bar = this.buildTextBar(model.remainingPercent, 20);
            let tooltip = `${model.displayName}\n${bar}  ${pctText} remaining`;
            if (model.resetText) {
                tooltip += `\n${model.resetText}`;
            }
            item.tooltip = tooltip;
            items.push(item);
        }
        return items;
    }
    getQuotaIcon(pct) {
        if (pct <= 0) {
            return '$(error)';
        }
        if (pct < 30) {
            return '$(warning)';
        }
        if (pct < 60) {
            return '$(info)';
        }
        return '$(pass)';
    }
    buildTextBar(pct, width) {
        const clamped = Math.max(0, Math.min(100, pct));
        const filled = Math.round((clamped / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }
}
exports.QuotaTreeDataProvider = QuotaTreeDataProvider;
class QuotaTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState) {
        super(label, collapsibleState);
    }
}
//# sourceMappingURL=quotaProvider.js.map