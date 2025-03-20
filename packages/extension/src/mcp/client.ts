import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";
import { formatError, delay } from "./utils.js";
import { EventEmitter } from "events";
import { ChildProcess } from "child_process";

export interface Tool {
    name: string;
    description?: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, { type: string }>;
        required?: string[];
    };
}

export type LogLevel = "debug" | "info" | "warning" | "error";

export interface LogMessage {
    level: LogLevel;
    data: string;
    timestamp?: string;
}

export class MCPClient extends EventEmitter {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    private serverProcess: ChildProcess | null = null;
    private tools: Tool[] = [];
    private logBuffer: string[] = [];

    constructor() {
        super();
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    private handleLogMessage(level: LogLevel, message: string) {
        const logMessage: LogMessage = {
            level,
            data: message,
            timestamp: new Date().toISOString()
        };

        this.emit("log", logMessage);

        // Also log to console with colors based on level
        let prefix = "";
        switch (level) {
            case "debug":
                prefix = chalk.gray("🔍 调试");
                console.log(chalk.gray(`${prefix} [MCP服务器] ${message}`));
                break;
            case "info":
                prefix = chalk.blue("ℹ️ 信息");
                console.log(chalk.blue(`${prefix} [MCP服务器] ${message}`));
                break;
            case "warning":
                prefix = chalk.yellow("⚠️ 警告");
                console.log(chalk.yellow(`${prefix} [MCP服务器] ${message}`));
                break;
            case "error":
                prefix = chalk.red("❌ 错误");
                console.log(chalk.red(`${prefix} [MCP服务器] ${message}`));
                break;
        }
    }

    private processServerOutput(data: string) {
        // Check if the data looks like a JSON-RPC message
        try {
            const json = JSON.parse(data);

            // Check if this appears to be a log notification
            if (json && json.method === "log" && json.params) {
                const level = json.params.level || "info";
                const message = json.params.data || "No message data";
                this.handleLogMessage(level as LogLevel, message);
                return;
            }
        } catch (e) {
            // Not JSON or not a log notification, process as normal output
        }

        // If we're here, it's either not JSON or not a log notification
        // Check if it looks like a structured log message
        if (data.includes(" - ")) {
            if (data.includes("INFO")) {
                this.handleLogMessage("info", data);
            } else if (data.includes("WARNING")) {
                this.handleLogMessage("warning", data);
            } else if (data.includes("ERROR")) {
                this.handleLogMessage("error", data);
            } else if (data.includes("DEBUG")) {
                this.handleLogMessage("debug", data);
            } else {
                this.handleLogMessage("info", data);
            }
        } else {
            // Just regular output
            this.handleLogMessage("info", data);
        }
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

                // Terminate any existing server process
                if (this.serverProcess) {
                    try {
                        this.serverProcess.kill();
                    } catch (error) {
                        console.log(chalk.yellow("\n⚠️ 终止旧服务器进程时出错:"), error);
                    }
                    this.serverProcess = null;
                }

                // Set up a custom child process to capture stderr
                const { spawn } = await import('child_process');
                this.serverProcess = spawn(cmd, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    detached: false
                });

                // Handle server stderr output
                this.serverProcess.stderr?.on('data', (data) => {
                    const message = data.toString().trim();
                    if (message) {
                        message.split('\n').forEach((line: string) => {
                            if (line.trim()) {
                                this.processServerOutput(line);
                            }
                        });
                    }
                });

                // Listen for process exit
                this.serverProcess.on('exit', (code) => {
                    console.log(chalk.gray(`\n📋 MCP服务器进程已退出，退出码: ${code}`));
                    this.serverProcess = null;
                });

                // Create transport using pipes to our spawned process
                this.transport = new StdioClientTransport({
                    command: cmd,
                    args: args
                });

                console.log(chalk.gray('\n⏳ 等待服务器初始化...'));
                await delay(1000);

                console.log(chalk.gray('🔌 正在连接服务器...'));
                this.mcp.connect(this.transport);

                console.log(chalk.gray('⏳ 等待连接稳定...'));
                await delay(1000);

                console.log(chalk.gray('📋 获取可用工具列表...'));
                const toolsResult = await this.mcp.listTools();
                this.tools = toolsResult.tools as Tool[];

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

    async executeTool(toolName: string, args: any) {
        try {
            const tool = this.tools.find(t => t.name === toolName);
            if (!tool) {
                throw new Error(`找不到工具: ${toolName}`);
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
            throw error;
        }
    }

    getTools(): Tool[] {
        return this.tools;
    }

    async cleanup() {
        console.log(chalk.gray('\n🧹 正在清理资源...'));

        // First close MCP connection
        if (this.transport) {
            try {
                console.log(chalk.gray('🔌 关闭MCP连接...'));
                await this.mcp.close();
                this.transport = null;
            } catch (error) {
                console.log(chalk.yellow("\n⚠️ 关闭MCP连接时出错:"), error);
            }
        }

        // Then terminate the server process
        if (this.serverProcess) {
            try {
                console.log(chalk.gray('🛑 终止MCP服务器进程...'));
                this.serverProcess.kill('SIGTERM');

                // Give it a moment to terminate gracefully
                await delay(500);

                // Force kill if still running
                if (this.serverProcess && !this.serverProcess.killed) {
                    console.log(chalk.yellow('⚠️ 服务器进程未响应SIGTERM，强制结束...'));
                    this.serverProcess.kill('SIGKILL');
                }
            } catch (error) {
                console.log(chalk.yellow("\n⚠️ 终止服务器进程时出错:"), error);
            } finally {
                this.serverProcess = null;
            }
        }

        console.log(chalk.green('✅ 所有资源已清理完毕'));
    }
} 