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
exports.QuotaApi = void 0;
const https = __importStar(require("https"));
const CLOUD_CODE_API_BASE = 'https://cloudcode-pa.googleapis.com';
const LOAD_CODE_ASSIST_PATH = '/v1internal:loadCodeAssist';
const FETCH_AVAILABLE_MODELS_PATH = '/v1internal:fetchAvailableModels';
/**
 * Calls the Cloud Code API to fetch project info and model quotas.
 */
class QuotaApi {
    constructor(authManager, log) {
        this.authManager = authManager;
        this.log = log;
    }
    async fetchQuota() {
        const accessToken = await this.authManager.getAccessToken();
        if (!accessToken) {
            return null;
        }
        // Step 1: Get project ID and tier
        this.log.appendLine('[API] Calling loadCodeAssist...');
        const projectInfo = await this.apiPost(`${CLOUD_CODE_API_BASE}${LOAD_CODE_ASSIST_PATH}`, {
            metadata: {
                ideType: 'ANTIGRAVITY',
                platform: 'PLATFORM_UNSPECIFIED',
                pluginType: 'GEMINI',
            },
        }, accessToken);
        const projectId = this.extractProjectId(projectInfo);
        const tier = this.extractTier(projectInfo);
        this.log.appendLine(`[API] Project: ${projectId}, Tier: ${tier}`);
        // Step 2: Fetch model quotas
        this.log.appendLine('[API] Calling fetchAvailableModels...');
        const body = projectId ? { project: projectId } : {};
        const modelsResponse = await this.apiPost(`${CLOUD_CODE_API_BASE}${FETCH_AVAILABLE_MODELS_PATH}`, body, accessToken);
        const rawModels = modelsResponse.models || {};
        const models = {};
        for (const [name, info] of Object.entries(rawModels)) {
            const quotaInfo = info.quotaInfo || {};
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
    extractProjectId(response) {
        const cp = response?.cloudaicompanionProject;
        if (!cp) {
            return null;
        }
        if (typeof cp === 'string') {
            return cp;
        }
        if (typeof cp === 'object') {
            return cp.id || cp.projectId || null;
        }
        return null;
    }
    extractTier(response) {
        const paid = response?.paidTier || {};
        const current = response?.currentTier || {};
        const tier = paid.id || paid.name || current.id || current.name;
        if (tier) {
            return tier;
        }
        const allowed = response?.allowedTiers || [];
        for (const t of allowed) {
            if (t.isDefault && t.id) {
                return t.id;
            }
        }
        return allowed.length > 0 ? 'LEGACY' : null;
    }
    formatModelName(name) {
        const fixed = name.replace(/(\d+)-(\d+)/g, '$1.$2');
        return fixed
            .split('-')
            .map((part) => {
            if (part && !/^\d/.test(part)) {
                return part.charAt(0).toUpperCase() + part.slice(1);
            }
            return part;
        })
            .join(' ');
    }
    computeResetText(resetTimeStr) {
        if (!resetTimeStr) {
            return '';
        }
        try {
            const resetTime = new Date(resetTimeStr);
            const now = new Date();
            const diffMs = resetTime.getTime() - now.getTime();
            if (diffMs <= 0) {
                return 'Resets very soon';
            }
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            if (days > 0) {
                return `Resets in ${days}d ${hours}h`;
            }
            if (hours > 0) {
                return `Resets in ${hours}h ${minutes}m`;
            }
            if (minutes > 0) {
                return `Resets in ${minutes}m`;
            }
            return 'Resets very soon';
        }
        catch {
            return `Reset: ${resetTimeStr}`;
        }
    }
    apiPost(endpoint, body, accessToken) {
        return new Promise((resolve, reject) => {
            const jsonBody = JSON.stringify(body);
            const parsed = new URL(endpoint);
            const options = {
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
                        }
                        catch {
                            resolve({});
                        }
                    }
                    else {
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
exports.QuotaApi = QuotaApi;
//# sourceMappingURL=api.js.map