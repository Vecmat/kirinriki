/**
 * 框架级配置服务。
 *
 * 统一封装环境变量读取（Node 的 process.env / Deno 的 Deno.env），
 * 提供类型安全的获取方法。后期可扩展为支持配置文件、远程配置中心等。
 */
export class Config {
    /**
     * 获取字符串配置。
     * @param key 配置键名
     * @param defaultValue 缺省时的默认值
     */
    getString(key: string, defaultValue = ""): string {
        const env = (globalThis as any).process?.env || (globalThis as any).Deno?.env?.toObject?.() || {};
        return env[key] ?? defaultValue;
    }

    /** 获取数值配置，解析失败返回默认值 */
    getNumber(key: string, defaultValue = 0): number {
        const raw = this.getString(key);
        const n = Number(raw);
        return Number.isFinite(n) ? n : defaultValue;
    }

    /** 获取布尔配置（"true"/"1" 视为 true） */
    getBoolean(key: string, defaultValue = false): boolean {
        const raw = this.getString(key).toLowerCase();
        if (raw === "") return defaultValue;
        return raw === "true" || raw === "1" || raw === "yes";
    }
}
