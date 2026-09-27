/**
 * 框架级日志服务。
 *
 * 当前为基于 console 的简单实现，预留接口以便后期替换为
 * 结构化日志（如 pino / winston）或远程日志收集。
 * 所有应用均可通过 `@Autowired(Logger)` 注入使用。
 */
export class Logger {
    private prefix: string;

    constructor(prefix = "Kirinriki") {
        this.prefix = prefix;
    }

    /** 调试日志（默认不输出，可通过环境变量 DEBUG=1 开启） */
    debug(...args: any[]): void {
        if ((globalThis as any).process?.env?.DEBUG) {
            console.debug(`[${this.prefix}][DEBUG]`, ...args);
        }
    }

    /** 信息日志 */
    info(...args: any[]): void {
        console.info(`[${this.prefix}][INFO]`, ...args);
    }

    /** 警告日志 */
    warn(...args: any[]): void {
        console.warn(`[${this.prefix}][WARN]`, ...args);
    }

    /** 错误日志 */
    error(...args: any[]): void {
        console.error(`[${this.prefix}][ERROR]`, ...args);
    }
}
