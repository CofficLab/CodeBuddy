"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultProviderConfig = exports.checkProviderConfig = exports.callAIAPI = void 0;
const vscode = require("vscode");
const node_fetch_1 = require("node-fetch");
/**
 * 调用AI API服务
 */
async function callAIAPI(prompt, provider) {
    // 获取API密钥
    const config = vscode.workspace.getConfiguration('buddycoder');
    const apiKey = config.get(`${provider}.apiKey`);
    if (!apiKey) {
        throw new Error(`API key for ${provider} is not configured`);
    }
    // 根据不同提供商实现不同的API调用
    switch (provider) {
        case 'openai':
            return callOpenAI(prompt, apiKey);
        case 'anthropic':
            return callAnthropic(prompt, apiKey);
        case 'deepseek':
            return callDeepseek(prompt, apiKey);
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}
exports.callAIAPI = callAIAPI;
/**
 * 检查指定AI提供商的配置状态
 */
function checkProviderConfig(provider) {
    const config = vscode.workspace.getConfiguration('buddycoder');
    const apiKey = config.get(`${provider}.apiKey`);
    return Boolean(apiKey);
}
exports.checkProviderConfig = checkProviderConfig;
/**
 * 获取默认AI提供商及其配置状态
 */
function getDefaultProviderConfig() {
    const config = vscode.workspace.getConfiguration('buddycoder');
    const provider = config.get('aiProvider') || 'openai';
    const hasApiKey = Boolean(config.get(`${provider}.apiKey`));
    return { provider, hasApiKey };
}
exports.getDefaultProviderConfig = getDefaultProviderConfig;
// OpenAI API调用
async function callOpenAI(prompt, apiKey) {
    try {
        const response = await (0, node_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
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
    }
    catch (error) {
        console.error('OpenAI API error:', error);
        throw new Error('Failed to get response from OpenAI');
    }
}
// Anthropic API调用
async function callAnthropic(prompt, apiKey) {
    try {
        const response = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
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
    }
    catch (error) {
        console.error('Anthropic API error:', error);
        throw new Error('Failed to get response from Anthropic');
    }
}
// Deepseek API调用
async function callDeepseek(prompt, apiKey) {
    try {
        const response = await (0, node_fetch_1.default)('https://api.deepseek.com/v1/chat/completions', {
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
    }
    catch (error) {
        console.error('Deepseek API error:', error);
        throw new Error('Failed to get response from Deepseek');
    }
}
//# sourceMappingURL=aiService.js.map