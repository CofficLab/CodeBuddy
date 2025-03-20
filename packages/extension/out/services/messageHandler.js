"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMessageHandler = void 0;
const vscode = require("vscode");
const aiService_1 = require("./aiService");
/**
 * 处理来自WebView的消息
 */
function setupMessageHandler(panel, context) {
    return panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'fetchAIResponse':
                await handleAIRequest(panel, message);
                break;
            case 'checkProvider':
                handleProviderCheck(panel, message);
                break;
            case 'openSettings':
                handleOpenSettings(message);
                break;
            default:
                vscode.window.showInformationMessage(message.message || 'Received message from webview');
        }
    }, undefined, context.subscriptions);
}
exports.setupMessageHandler = setupMessageHandler;
/**
 * 处理AI请求
 */
async function handleAIRequest(panel, message) {
    const requestProvider = message.provider ||
        vscode.workspace.getConfiguration('buddycoder').get('aiProvider');
    // 检查是否有API密钥
    const hasProviderApiKey = (0, aiService_1.checkProviderConfig)(requestProvider);
    if (!hasProviderApiKey) {
        panel.webview.postMessage({
            command: 'configurationRequired',
            provider: requestProvider
        });
        return;
    }
    try {
        // 调用AI API
        const response = await (0, aiService_1.callAIAPI)(message.prompt, requestProvider);
        panel.webview.postMessage({
            command: 'aiResponse',
            response
        });
    }
    catch (error) {
        panel.webview.postMessage({
            command: 'error',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}
/**
 * 处理提供商检查
 */
function handleProviderCheck(panel, message) {
    const hasApiKey = (0, aiService_1.checkProviderConfig)(message.provider);
    panel.webview.postMessage({
        command: 'providerStatus',
        provider: message.provider,
        hasApiKey
    });
}
/**
 * 处理打开设置
 */
function handleOpenSettings(message) {
    vscode.commands.executeCommand('workbench.action.openSettings', `buddycoder.${message.provider}.apiKey`);
}
//# sourceMappingURL=messageHandler.js.map