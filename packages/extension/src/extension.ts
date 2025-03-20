// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { TextEncoder } from "util";
import fetch from 'node-fetch';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log(
        'Congratulations, your extension "vue-3-vscode-webview" is now active!'
    );
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let kindDisposable = vscode.commands.registerCommand(
        `vue-3-vscode-webview.createFlow`,
        () => {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            vscode.window.showInformationMessage(
                "Opening AI Chat Interface"
            );
            const panel = prepareWebView(context);

            // 获取用户配置
            const config = vscode.workspace.getConfiguration('buddycoder');
            const aiProvider = config.get('aiProvider') as string;
            const hasApiKey = Boolean(config.get(`${aiProvider}.apiKey`));

            // 发送配置信息给WebView
            panel.webview.postMessage({
                command: 'setConfig',
                aiProvider,
                hasApiKey
            });

            panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'fetchAIResponse':
                            // 获取用户请求的提供商或使用默认提供商
                            const requestProvider = message.provider || aiProvider;

                            // 检查指定提供商是否有API密钥
                            const providerApiKey = config.get(`${requestProvider}.apiKey`);
                            const hasProviderApiKey = Boolean(providerApiKey);

                            // 检查是否有API密钥
                            if (!hasProviderApiKey) {
                                panel.webview.postMessage({
                                    command: 'configurationRequired',
                                    provider: requestProvider
                                });
                                return;
                            }

                            try {
                                // 调用AI API
                                const response = await callAIAPI(message.prompt, requestProvider);
                                panel.webview.postMessage({
                                    command: 'aiResponse',
                                    response
                                });
                            } catch (error) {
                                panel.webview.postMessage({
                                    command: 'error',
                                    message: error instanceof Error ? error.message : String(error)
                                });
                            }
                            break;

                        case 'checkProvider':
                            // 检查指定提供商是否配置了API密钥
                            const checkProvider = message.provider;
                            const checkApiKey = config.get(`${checkProvider}.apiKey`);
                            panel.webview.postMessage({
                                command: 'providerStatus',
                                provider: checkProvider,
                                hasApiKey: Boolean(checkApiKey)
                            });
                            break;

                        case 'openSettings':
                            // 打开设置页面
                            vscode.commands.executeCommand(
                                'workbench.action.openSettings',
                                `buddycoder.${message.provider}.apiKey`
                            );
                            break;

                        default:
                            vscode.window.showInformationMessage(message.message || 'Received message from webview');
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );
    context.subscriptions.push(kindDisposable);
}

// 调用AI API的函数
async function callAIAPI(prompt: string, provider: string): Promise<string> {
    // 获取API密钥
    const config = vscode.workspace.getConfiguration('buddycoder');
    const apiKey = config.get(`${provider}.apiKey`);

    if (!apiKey) {
        throw new Error(`API key for ${provider} is not configured`);
    }

    // 根据不同提供商实现不同的API调用
    switch (provider) {
        case 'openai':
            // 实现OpenAI API调用
            return callOpenAI(prompt, apiKey as string);
        case 'anthropic':
            // 实现Anthropic API调用
            return callAnthropic(prompt, apiKey as string);
        case 'deepseek':
            // 实现Deepseek API调用
            return callDeepseek(prompt, apiKey as string);
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}

// OpenAI API调用
async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
    // 这里实现OpenAI API调用
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw new Error('Failed to get response from OpenAI');
    }
}

// Anthropic API调用
async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
    // 这里实现Anthropic API调用
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-2',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000
            })
        });

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Anthropic API error:', error);
        throw new Error('Failed to get response from Anthropic');
    }
}

// Deepseek API调用
async function callDeepseek(prompt: string, apiKey: string): Promise<string> {
    // 这里实现Deepseek API调用
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Deepseek API error:', error);
        throw new Error('Failed to get response from Deepseek');
    }
}

export function prepareWebView(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        "vueWebview",
        "AI Chat",
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(
                    path.join(context.extensionPath, "vue-dist", "assets")
                ),
            ],
        }
    );

    const dependencyNameList: string[] = [
        "index.css",
        "index.js",
        "vendor.js",
        "logo.png",
    ];
    const dependencyList: vscode.Uri[] = dependencyNameList.map((item) =>
        panel.webview.asWebviewUri(
            vscode.Uri.file(
                path.join(context.extensionPath, "vue-dist", "assets", item)
            )
        )
    );
    const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Chat</title>
    <script>
          const vscode = acquireVsCodeApi();
    </script>
    <script type="module" crossorigin src="${dependencyList[1]}"></script>
    <link rel="modulepreload" href="${dependencyList[2]}">
    <link rel="stylesheet" href="${dependencyList[0]}">
  </head>
  <body>
    <div id="app"></div>
  </body>
  </html>
  `;
    panel.webview.html = html;
    return panel;
}
// this method is called when your extension is deactivated
export function deactivate() { }
