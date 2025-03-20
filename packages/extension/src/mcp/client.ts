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
                console.log(chalk.cyan(`\n🚀 Starting server with command (attempt ${attempt}/${retries}):`), chalk.yellow(command));

                const [cmd, ...args] = command.split(' ').filter(Boolean);
                if (!cmd || args.length === 0) {
                    throw new Error("Invalid command format. Please provide both command and script path");
                }

                console.log(chalk.gray('\nCommand details:'));
                console.log(chalk.gray('  Command:'), chalk.blue(cmd));
                console.log(chalk.gray('  Arguments:'), chalk.blue(args.join(' ')));

                if (this.transport) {
                    try {
                        await this.mcp.close();
                    } catch (error) {
                        console.log(chalk.yellow("\n⚠️ Error while cleaning up previous connection:"), error);
                    }
                    this.transport = null;
                }

                this.transport = new StdioClientTransport({
                    command: cmd,
                    args: args,
                });

                console.log(chalk.gray('\n⏳ Waiting for server initialization...'));
                await delay(1000);

                console.log(chalk.gray('🔌 Connecting to server...'));
                this.mcp.connect(this.transport);

                console.log(chalk.gray('⏳ Waiting for connection stabilization...'));
                await delay(1000);

                console.log(chalk.gray('📋 Fetching available tools...'));
                const toolsResult = await this.mcp.listTools();
                this.tools = toolsResult.tools;

                console.log(chalk.green("\n✅ Connected to server with tools:"));
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
                    this.transport = null;
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

    async close() {
        this.rl.close();
        await this.cleanup();
    }
} 