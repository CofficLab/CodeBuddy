"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
// The module 'vscode' contains the VS Code extensibility API
const vscode = require("vscode");
const webviewService_1 = require("./services/webviewService");
const messageHandler_1 = require("./services/messageHandler");
const aiService_1 = require("./services/aiService");
/**
 * 扩展激活时调用此方法
 */
function activate(context) {
    console.log('Extension "vue-3-vscode-webview" is now active!');
    // 注册命令
    let disposable = vscode.commands.registerCommand(`vue-3-vscode-webview.createFlow`, () => {
        // 显示通知
        vscode.window.showInformationMessage("Opening AI Chat Interface");
        // 创建WebView面板
        const panel = (0, webviewService_1.createWebviewPanel)(context);
        // 获取默认AI提供商配置
        const { provider, hasApiKey } = (0, aiService_1.getDefaultProviderConfig)();
        // 发送配置信息给WebView
        panel.webview.postMessage({
            command: 'setConfig',
            aiProvider: provider,
            hasApiKey
        });
        // 设置消息处理
        (0, messageHandler_1.setupMessageHandler)(panel, context);
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
/**
 * 扩展停用时调用此方法
 */
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map