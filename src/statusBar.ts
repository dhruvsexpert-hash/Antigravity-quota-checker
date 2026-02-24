import * as vscode from 'vscode';
import { QuotaData } from './api';

/**
 * Manages a status bar item that shows the lowest-quota model at a glance.
 */
export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'antigravity-quota.refresh';
        this.statusBarItem.name = 'Antigravity Quota';
        this.showDisconnected();
    }

    update(data: QuotaData): void {
        const entries = Object.entries(data.models);
        if (entries.length === 0) {
            this.statusBarItem.text = '$(rocket) No quota data';
            this.statusBarItem.tooltip = 'Antigravity Quota Watcher — No models found';
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.show();
            return;
        }

        // Find the model with the lowest remaining quota
        let lowestName = '';
        let lowestPct = Infinity;
        for (const [, model] of entries) {
            if (model.remainingPercent < lowestPct) {
                lowestPct = model.remainingPercent;
                lowestName = model.displayName;
            }
        }

        const icon = this.getIcon(lowestPct);
        const pctText = lowestPct <= 0 ? 'DEPLETED' : `${lowestPct.toFixed(1)}%`;

        this.statusBarItem.text = `${icon} ${lowestName}: ${pctText}`;

        // Build full tooltip with all models
        const lines = ['Antigravity Quota Watcher', ''];
        if (data.tier) {
            lines.push(`Tier: ${data.tier}`);
            lines.push('');
        }

        // Sort for tooltip display
        const sorted = entries
            .map(([, m]) => m)
            .sort((a, b) => a.remainingPercent - b.remainingPercent);

        for (const model of sorted) {
            const bar = this.buildBar(model.remainingPercent, 15);
            const p = model.remainingPercent <= 0 ? 'DEPLETED' : `${model.remainingPercent.toFixed(1)}%`;
            let line = `${bar}  ${p}  ${model.displayName}`;
            if (model.resetText) {
                line += `  (${model.resetText})`;
            }
            lines.push(line);
        }

        this.statusBarItem.tooltip = lines.join('\n');

        // Color the background for critical states
        if (lowestPct <= 0) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (lowestPct < 30) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }

        this.statusBarItem.show();
    }

    showLoading(): void {
        this.statusBarItem.text = '$(loading~spin) Quota...';
        this.statusBarItem.tooltip = 'Antigravity Quota — Loading...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
    }

    showDisconnected(): void {
        this.statusBarItem.text = '$(rocket) Quota: Sign In';
        this.statusBarItem.tooltip = 'Antigravity Quota — Click to sign in';
        this.statusBarItem.command = 'antigravity-quota.signIn';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
    }

    showError(): void {
        this.statusBarItem.text = '$(rocket) Quota: Error';
        this.statusBarItem.tooltip = 'Antigravity Quota — Failed to fetch. Click to retry.';
        this.statusBarItem.command = 'antigravity-quota.refresh';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.show();
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }

    private getIcon(pct: number): string {
        if (pct <= 0) { return '$(error)'; }
        if (pct < 30) { return '$(warning)'; }
        if (pct < 60) { return '$(info)'; }
        return '$(rocket)';
    }

    private buildBar(pct: number, width: number): string {
        const clamped = Math.max(0, Math.min(100, pct));
        const filled = Math.round((clamped / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }
}
