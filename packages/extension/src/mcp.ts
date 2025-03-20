import readline from "readline/promises";
import dotenv from "dotenv";
import chalk from "chalk";
import { MCPClient } from "./mcp/client";
import { ConfigManager } from "./mcp/config";
import { formatError } from "./mcp/utils";

// 强制启用颜色输出
process.env.FORCE_COLOR = '1';
chalk.level = 3;

dotenv.config();

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const mcpClient = new MCPClient(rl);
    const configManager = new ConfigManager(rl);

    try {
        let config;
        if (process.argv.length < 3) {
            config = await configManager.promptConfig();
        } else {
            config = configManager.parseCommandLineArgs(process.argv);
        }

        console.log(chalk.cyan('\n🚀 正在启动 MCP 服务...'));
        console.log(chalk.blue(`📂 脚本路径：`) + chalk.yellow(config.scriptPath));
        console.log(chalk.blue(`🐶 启动命令：`) + chalk.yellow(config.command) + '\n');

        await mcpClient.connectToServer(`${config.command} ${config.scriptPath}`);
        await mcpClient.chatLoop();
    } catch (error) {
        const errorMsg = formatError(error);
        console.error(chalk.red('\n❌ MCP 服务启动失败：\n') + errorMsg);
        process.exit(1);
    } finally {
        rl.close();
        await mcpClient.cleanup();
    }
}

main().catch((error) => {
    console.error(chalk.red('\n❌ 程序执行出错：'), error);
    process.exit(1);
});