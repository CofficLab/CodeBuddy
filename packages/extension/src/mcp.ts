import { Anthropic } from "@anthropic-ai/sdk";
import {
    MessageParam,
    Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import os from "os";

// 强制启用颜色输出
process.env.FORCE_COLOR = '1';
chalk.level = 3;

// 测试颜色输出
console.log('Color test:',
    chalk.red('red'),
    chalk.green('green'),
    chalk.blue('blue'),
    chalk.yellow('yellow')
);

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// if (!ANTHROPIC_API_KEY) {
//     throw new Error("ANTHROPIC_API_KEY is not set");
// }

// 默认配置
const projectDir = path.join(os.homedir(), 'Code', 'Playground', 'build_mcp_for_cursor', 'project');
const defaultPath = path.join(projectDir, 'main.py');
const defaultCommand = `uv --directory ${projectDir} run`;

// 格式化错误信息的辅助函数
function formatError(error: any): string {
    const errorMessage = error.message || String(error);
    const errorStack = error.stack ? `\n${error.stack}` : '';
    return chalk.red(errorMessage) + chalk.gray(errorStack);
}

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MCPClient {
    private mcp: Client;
    private anthropic: Anthropic;
    private transport: StdioClientTransport | null = null;
    private tools: Tool[] = [];
    private rl: readline.Interface;

    constructor() {
        this.anthropic = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    async connectToServer(command: string, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(chalk.cyan(`\n🚀 Starting server with command (attempt ${attempt}/${retries}):`), chalk.yellow(command));

                const [cmd, ...args] = command.split(' ');
                if (!cmd || args.length === 0) {
                    throw new Error("Invalid command format. Please provide both command and script path (e.g., 'node server.js' or 'python server.py')");
                }

                this.transport = new StdioClientTransport({
                    command: cmd,
                    args: args,
                });

                // 等待一段时间让服务器初始化
                await delay(1000);

                this.mcp.connect(this.transport);

                // 再等待一段时间确保连接稳定
                await delay(1000);

                const toolsResult = await this.mcp.listTools();
                this.tools = toolsResult.tools.map((tool) => {
                    return {
                        name: tool.name,
                        description: tool.description,
                        input_schema: tool.inputSchema,
                    };
                });

                const toolNames = this.tools.map(({ name }) => name);
                console.log(
                    chalk.green("\n✅ Connected to server with tools:")
                );
                console.log(chalk.blue(toolNames.map(name => `  • ${name}`).join("\n")));
                return; // 成功连接，退出重试循环
            } catch (e) {
                const errorMsg = formatError(e);
                console.log(chalk.yellow(`\n⚠️ Attempt ${attempt}/${retries} failed:`), "\n" + errorMsg);

                if (attempt === retries) {
                    console.log(chalk.red("\n❌ Failed to connect to MCP server after all attempts"));
                    throw e;
                }

                // 清理当前连接
                if (this.transport) {
                    try {
                        await this.mcp.close();
                    } catch (closeError) {
                        console.log(chalk.yellow("\n⚠️ Error while cleaning up connection:"), closeError);
                    }
                }

                // 等待一段时间后重试
                console.log(chalk.blue(`\n🔄 Waiting 2 seconds before retry...`));
                await delay(2000);
            }
        }
    }

    async processQuery(query: string) {
        const messages: MessageParam[] = [
            {
                role: "user",
                content: query,
            },
        ];

        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages,
            tools: this.tools,
        });

        const finalText = [];
        const toolResults = [];

        for (const content of response.content) {
            if (content.type === "text") {
                finalText.push(content.text);
            } else if (content.type === "tool_use") {
                const toolName = content.name;
                const toolArgs = content.input as { [x: string]: unknown } | undefined;

                const result = await this.mcp.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });
                toolResults.push(result);
                finalText.push(
                    chalk.magenta(`🔧 [Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`)
                );

                messages.push({
                    role: "user",
                    content: result.content as string,
                });

                const response = await this.anthropic.messages.create({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 1000,
                    messages,
                });

                finalText.push(
                    response.content[0].type === "text" ? response.content[0].text : ""
                );
            }
        }

        return finalText.join("\n");
    }

    async chatLoop() {
        try {
            console.log(chalk.green("\n🎉 MCP Client Started!"));
            console.log(chalk.blue("💬 Type your queries or 'quit' to exit."));

            while (true) {
                const message = await this.rl.question(chalk.yellow("\n🤔 Query: "));
                if (message.toLowerCase() === "quit") {
                    break;
                }
                const response = await this.processQuery(message);
                console.log("\n" + response);
            }
        } finally {
            this.rl.close();
        }
    }

    async cleanup() {
        await this.mcp.close();
    }

    private checkScriptExists(scriptPath: string): boolean {
        if (!fs.existsSync(scriptPath)) {
            console.log(chalk.yellow(`\n💡 提示：找不到服务器脚本：`) + chalk.red(scriptPath));
            console.log(chalk.blue('请检查路径是否正确。\n'));
            return false;
        }
        return true;
    }

    async start(scriptPath: string = defaultPath, command: string = defaultCommand) {
        if (!this.checkScriptExists(scriptPath)) {
            process.exit(1);
        }

        const fullCommand = `${command} ${path.basename(scriptPath)}`;

        console.log(chalk.cyan('\n🚀 正在启动 MCP 服务...'));
        console.log(chalk.blue(`📂 脚本路径：`) + chalk.yellow(scriptPath));
        console.log(chalk.blue(`🐶 启动命令：`) + chalk.yellow(fullCommand) + '\n');

        try {
            await this.connectToServer(fullCommand);
            await this.chatLoop();
        } catch (error) {
            const errorMsg = formatError(error);
            console.error(chalk.red('\n❌ MCP 服务启动失败：\n') + errorMsg);
            process.exit(1);
        } finally {
            await this.cleanup();
        }
    }

    async promptConfig() {
        const title = chalk.cyan('\n💡 欢迎使用 MCP 服务！');
        const defaultPathInfo = [
            chalk.blue('\n默认服务器脚本路径：'),
            chalk.yellow(defaultPath),
            chalk.blue('\n默认启动命令：'),
            chalk.yellow(`${defaultCommand} main.py`),
        ].join('\n');

        const options = [
            chalk.yellow('\n\n选项：'),
            chalk.white('1) 使用默认配置 [回车]'),
            chalk.white('2) 自定义配置\n'),
        ].join('\n');

        console.log([title, defaultPathInfo, options].join(''));

        const answer = await this.rl.question(chalk.green('请选择 (1-2): '));
        const choice = answer.trim() || '1';

        switch (choice) {
            case '1':
                await this.start();
                break;
            case '2':
                const workDir = await this.rl.question(chalk.blue('\n请输入工作目录路径: '));
                const resolvedWorkDir = path.resolve(process.cwd(), workDir.trim());
                const scriptName = await this.rl.question(chalk.blue('请输入脚本名称 (例如: main.py): '));
                const customCommand = `uv --directory ${resolvedWorkDir} run`;
                const scriptPath = path.join(resolvedWorkDir, scriptName.trim());
                await this.start(scriptPath, customCommand);
                break;
            default:
                console.log(chalk.yellow('\n❌ 无效的选择！使用默认配置继续...\n'));
                await this.start();
        }
    }
}

async function main() {
    const mcpClient = new MCPClient();

    if (process.argv.length < 3) {
        await mcpClient.promptConfig();
    } else {
        const arg = process.argv[2];
        if (arg.includes('--directory')) {
            // 如果包含 --directory，说明提供了完整的 uv 命令
            await mcpClient.start(defaultPath, arg);
        } else {
            // 如果是普通路径，使用默认命令
            const scriptPath = path.resolve(process.cwd(), arg);
            const workDir = path.dirname(scriptPath);
            const command = `uv --directory ${workDir} run`;
            await mcpClient.start(scriptPath, command);
        }
    }
}

main().catch((error) => {
    console.error(chalk.red('\n❌ 程序执行出错：'), error);
    process.exit(1);
});