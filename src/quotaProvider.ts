import * as vscode from 'vscode';
import { QuotaData, ModelQuota } from './api';

/**
 * Tree data provider that shows Antigravity model quotas in the sidebar.
 */
export class QuotaTreeDataProvider implements vscode.TreeDataProvider<QuotaTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<QuotaTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private data: QuotaData | null = null;
    private authenticated = false;
    private loading = false;
    private errorMessage: string | null = null;

    update(data: QuotaData | null): void {
        this.data = data;
        this.errorMessage = null;
        this._onDidChangeTreeData.fire();
    }

    setAuthenticated(auth: boolean): void {
        this.authenticated = auth;
        if (!auth) {
            this.data = null;
        }
        this._onDidChangeTreeData.fire();
    }

    setLoading(loading: boolean): void {
        this.loading = loading;
        this._onDidChangeTreeData.fire();
    }

    setError(message: string): void {
        this.errorMessage = message;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: QuotaTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: QuotaTreeItem): QuotaTreeItem[] {
        if (element) {
            return []; // No nested children
        }

        if (!this.authenticated) {
            const item = new QuotaTreeItem(
                '$(sign-in) Sign in to view quota',
                vscode.TreeItemCollapsibleState.None
            );
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
            const errItem = new QuotaTreeItem(
                `$(error) ${this.errorMessage}`,
                vscode.TreeItemCollapsibleState.None
            );
            return [errItem];
        }

        if (!this.data) {
            return [new QuotaTreeItem('$(info) No quota data yet', vscode.TreeItemCollapsibleState.None)];
        }

        const items: QuotaTreeItem[] = [];

        // Tier header
        if (this.data.tier) {
            const tierItem = new QuotaTreeItem(
                `$(star) Tier: ${this.data.tier}`,
                vscode.TreeItemCollapsibleState.None
            );
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

            const item = new QuotaTreeItem(
                `${icon} ${model.displayName}  —  ${pctText}`,
                vscode.TreeItemCollapsibleState.None
            );

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

    private getQuotaIcon(pct: number): string {
        if (pct <= 0) { return '$(error)'; }
        if (pct < 30) { return '$(warning)'; }
        if (pct < 60) { return '$(info)'; }
        return '$(pass)';
    }

    private buildTextBar(pct: number, width: number): string {
        const clamped = Math.max(0, Math.min(100, pct));
        const filled = Math.round((clamped / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }
}

class QuotaTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
