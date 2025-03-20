import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import chalk from "chalk";
import { formatError, delay } from "./utils.js";

export class MCPClient {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    private tools: any[] = [];
    private rl: readline.Interface;

    constructor(rl: readline.Interface) {
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
        this.rl = rl;
    }

    async connectToServer(command: string, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(chalk.cyan(`\n🚀 正在启动服务器 (第 ${attempt}/${retries} 次尝试):`), chalk.yellow(command));

                const [cmd, ...args] = command.split(' ').filter(Boolean);
                if (!cmd || args.length === 0) {
                    throw new Error("命令格式无效。请同时提供命令和脚本路径");
                }

                console.log(chalk.gray('\n命令详情:'));
                console.log(chalk.gray('  命令:'), chalk.blue(cmd));
                console.log(chalk.gray('  参数:'), chalk.blue(args.join(' ')));

                if (this.transport) {
                    try {
                        await this.mcp.close();
                    } catch (error) {
                        console.log(chalk.yellow("\n⚠️ 清理旧连接时出错:"), error);
                    }
                    this.transport = null;
                }

                this.transport = new StdioClientTransport({
                    command: cmd,
                    args: args,
                });

                console.log(chalk.gray('\n⏳ 等待服务器初始化...'));
                await delay(1000);

                console.log(chalk.gray('🔌 正在连接服务器...'));
                this.mcp.connect(this.transport);

                console.log(chalk.gray('⏳ 等待连接稳定...'));
                await delay(1000);

                console.log(chalk.gray('📋 获取可用工具列表...'));
                const toolsResult = await this.mcp.listTools();
                this.tools = toolsResult.tools;

                console.log(chalk.green("\n✅ 已连接到服务器，可用工具如下:"));
                this.tools.forEach((tool, index) => {
                    console.log(chalk.blue(`  ${index + 1}. ${tool.name}`));
                    console.log(chalk.gray(`     ${tool.description}`));
                });
                return;
            } catch (e) {
                const errorMsg = formatError(e);
                console.log(chalk.yellow(`\n⚠️ 第 ${attempt}/${retries} 次尝试失败:`), "\n" + errorMsg);

                if (attempt === retries) {
                    console.log(chalk.red("\n❌ 多次尝试后仍无法连接到服务器"));
                    throw e;
                }

                if (this.transport) {
                    try {
                        await this.mcp.close();
                    } catch (closeError) {
                        console.log(chalk.yellow("\n⚠️ 清理连接时出错:"), closeError);
                    }
                    this.transport = null;
                }

                console.log(chalk.blue(`\n🔄 等待 2 秒后重试...`));
                await delay(2000);
            }
        }
    }

    async executeTool(toolIndex: number, args: any) {
        try {
            const tool = this.tools[toolIndex];
            if (!tool) {
                throw new Error('工具索引无效');
            }

            console.log(chalk.cyan(`\n🔧 正在执行工具: ${tool.name}`));
            console.log(chalk.gray(`参数: ${JSON.stringify(args, null, 2)}`));

            const result = await this.mcp.callTool({
                name: tool.name,
                arguments: args,
            });

            console.log(chalk.green('\n✅ 执行结果:'));
            console.log(result.content);
            return result;
        } catch (error) {
            console.error(chalk.red('\n❌ 执行工具时出错:'), error);
            return null;
        }
    }

    async promptForToolArguments(tool: any) {
        const args: any = {};
        const schema = tool.inputSchema.properties;

        console.log(chalk.yellow(`\n📝 请输入 ${tool.name} 的参数:`));

        for (const [key, prop] of Object.entries<{ type: string }>(schema)) {
            const isRequired = tool.inputSchema.required?.includes(key);
            const prompt = `${key}${isRequired ? ' (必填)' : ' (选填)'}: `;
            const value = await this.rl.question(chalk.blue(prompt));

            if (value || isRequired) {
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
            console.log(chalk.green("\n🎉 MCP 客户端已启动!"));
            console.log(chalk.blue("💬 输入工具编号或输入 'quit' 退出"));

            while (true) {
                console.log(chalk.yellow("\n📋 可用工具列表:"));
                this.tools.forEach((tool, index) => {
                    console.log(chalk.blue(`${index + 1}. ${tool.name}`));
                });

                const input = await this.rl.question(chalk.yellow("\n🔧 请选择工具 (1-" + this.tools.length + ") 或输入 'quit' 退出: "));

                if (input.toLowerCase() === "quit") {
                    break;
                }

                const toolIndex = parseInt(input) - 1;
                if (isNaN(toolIndex) || toolIndex < 0 || toolIndex >= this.tools.length) {
                    console.log(chalk.red("\n❌ 无效的工具选择!"));
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

    async close() {
        this.rl.close();
        await this.cleanup();
    }
} 