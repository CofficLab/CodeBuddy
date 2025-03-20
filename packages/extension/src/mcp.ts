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
    private transport: StdioClientTransport | null = null;
    private tools: any[] = [];
    private rl: readline.Interface;

    constructor() {
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
                this.tools = toolsResult.tools;

                console.log(
                    chalk.green("\n✅ Connected to server with tools:")
                );
                this.tools.forEach((tool, index) => {
                    console.log(chalk.blue(`  ${index + 1}. ${tool.name}`));
                    console.log(chalk.gray(`     ${tool.description}`));
                });
                return;
            } catch (e) {
                const errorMsg = formatError(e);
                console.log(chalk.yellow(`\n⚠️ Attempt ${attempt}/${retries} failed:`), "\n" + errorMsg);

                if (attempt === retries) {
                    console.log(chalk.red("\n❌ Failed to connect to MCP server after all attempts"));
                    throw e;
                }

                if (this.transport) {
                    try {
                        await this.mcp.close();
                    } catch (closeError) {
                        console.log(chalk.yellow("\n⚠️ Error while cleaning up connection:"), closeError);
                    }
                }

                console.log(chalk.blue(`\n🔄 Waiting 2 seconds before retry...`));
                await delay(2000);
            }
        }
    }

    async executeTool(toolIndex: number, args: any) {
        try {
            const tool = this.tools[toolIndex];
            if (!tool) {
                throw new Error('Invalid tool index');
            }

            console.log(chalk.cyan(`\n🔧 Executing tool: ${tool.name}`));
            console.log(chalk.gray(`Arguments: ${JSON.stringify(args, null, 2)}`));

            const result = await this.mcp.callTool({
                name: tool.name,
                arguments: args,
            });

            console.log(chalk.green('\n✅ Result:'));
            console.log(result.content);
            return result;
        } catch (error) {
            console.error(chalk.red('\n❌ Error executing tool:'), error);
            return null;
        }
    }

    async promptForToolArguments(tool: any) {
        const args: any = {};
        const schema = tool.inputSchema.properties;

        console.log(chalk.yellow(`\n📝 Enter arguments for ${tool.name}:`));

        for (const [key, prop] of Object.entries<{ type: string }>(schema)) {
            const isRequired = tool.inputSchema.required?.includes(key);
            const prompt = `${key}${isRequired ? ' (required)' : ' (optional)'}: `;
            const value = await this.rl.question(chalk.blue(prompt));

            if (value || isRequired) {
                // 根据类型转换值
                switch (prop.type) {
                    case 'number':
                        args[key] = Number(value);
                        break;
                    case 'boolean':
                        args[key] = value.toLowerCase() === 'true';
                        break;
                    case 'object':
                        try {
                            args[key] = JSON.parse(value);
                        } catch {
                            args[key] = value;
                        }
                        break;
                    default:
                        args[key] = value;
                }
            }
        }

        return args;
    }

    async chatLoop() {
        try {
            console.log(chalk.green("\n🎉 MCP Client Started!"));
            console.log(chalk.blue("💬 Enter tool number or 'quit' to exit."));

            while (true) {
                console.log(chalk.yellow("\n📋 Available tools:"));
                this.tools.forEach((tool, index) => {
                    console.log(chalk.blue(`${index + 1}. ${tool.name}`));
                });

                const input = await this.rl.question(chalk.yellow("\n🔧 Select tool (1-" + this.tools.length + ") or 'quit': "));

                if (input.toLowerCase() === "quit") {
                    break;
                }

                const toolIndex = parseInt(input) - 1;
                if (isNaN(toolIndex) || toolIndex < 0 || toolIndex >= this.tools.length) {
                    console.log(chalk.red("\n❌ Invalid tool selection!"));
                    continue;
                }

                const selectedTool = this.tools[toolIndex];
                const args = await this.promptForToolArguments(selectedTool);
                await this.executeTool(toolIndex, args);
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