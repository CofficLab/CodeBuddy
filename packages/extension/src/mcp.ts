import readline from "readline/promises";
import dotenv from "dotenv";
import chalk from "chalk";
import { CLI } from "./mcp/cli.js";
import { ConfigManager } from "./mcp/config.js";
import { formatError } from "./mcp/utils.js";

// 强制启用颜色输出
process.env.FORCE_COLOR = '1';
chalk.level = 3;

dotenv.config();

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const cli = new CLI(rl);
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

        await cli.start(`${config.command} ${config.scriptPath}`);
    } catch (error) {
        const errorMsg = formatError(error);
        console.error(chalk.red('\n❌ MCP 服务启动失败：\n') + errorMsg);
        process.exitCode = 1;
    } finally {
        rl.close();
        // 确保程序在所有事件处理完成后退出
        console.log(chalk.gray('\n🖐 程序退出中...'));

        // 给予一点时间确保所有日志都输出完毕
        setTimeout(() => {
            process.exit(process.exitCode || 0);
        }, 500);
    }
}

// Run the main function
main().catch(error => {
    console.error(chalk.red('\n❌ 未处理的错误：\n'), error);
    process.exit(1);
});