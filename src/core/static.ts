import type { Hono } from "hono";
import { appRegistry, type AppDefinition } from "./app-registry";

/**
 * 静态文件服务：把每个应用的 static 目录挂载到 `/{appHash}/*` 路径。
 *
 * 运行时限制：
 * - Node.js / Bun / Deno：可用，基于文件系统读取
 * - Cloudflare Workers 等无文件系统的环境：自动跳过，需改用 R2 / CDN
 *
 * 文件系统模块使用动态 require，避免被打包工具静态解析进 Workers 产物。
 */
export class StaticService {
    private hono: Hono;

    /** @param hono 要挂载静态路由的 Hono 实例 */
    constructor(hono: Hono) {
        this.hono = hono;
    }

    /** 为所有已注册应用挂载静态路由 */
    mountAll(): void {
        for (const app of appRegistry.list()) {
            this.mountApp(app);
        }
    }

    /** 为单个应用挂载 `/{appHash}/*` 静态路由 */
    private mountApp(app: AppDefinition): void {
        // 无静态目录的纯接口应用直接跳过
        if (!app.staticDir) return;
        const route = `/${app.appHash}/*`;
        this.hono.get(route, async (c: any) => {
            try {
                const fs = await this.getFs();
                const path = await this.getPath();
                // 请求路径中 appHash 之后的部分作为文件相对路径
                const urlPath = c.req.path;
                const prefix = `/${app.appHash}`;
                const relative = urlPath.startsWith(prefix)
                    ? urlPath.slice(prefix.length)
                    : urlPath;
                // relative 以 "/" 开头，path.join 会正确拼接
                const filePath = path.join(app.staticDir, relative);

                // 安全检查：防止目录穿越
                const resolved = path.resolve(filePath);
                const staticRoot = path.resolve(app.staticDir);
                if (!resolved.startsWith(staticRoot)) {
                    return c.text("Forbidden", 403);
                }

                const stat = await fs.stat(resolved).catch(() => null);
                if (!stat || !stat.isFile()) {
                    return c.text("Not Found", 404);
                }

                const data = await fs.readFile(resolved);
                const ext = path.extname(resolved).toLowerCase();
                const mime = this.mime(ext);
                return c.body(data, 200, { "Content-Type": mime });
            } catch (err: any) {
                // Workers 等环境无 fs，返回提示
                return c.text(
                    "Static file service unavailable in this runtime",
                    501,
                );
            }
        });
    }

    /** 动态获取 fs/promises（避免 Workers 打包时静态依赖 node:fs） */
    private async getFs(): Promise<any> {
        // Node / Bun（CommonJS require）
        if (typeof (globalThis as any).require === "function") {
            return (globalThis as any).require("node:fs/promises");
        }
        // Deno / ESM 环境
        const mod = await import("node:fs/promises");
        return mod;
    }

    /** 动态获取 path 模块 */
    private async getPath(): Promise<any> {
        if (typeof (globalThis as any).require === "function") {
            return (globalThis as any).require("node:path");
        }
        const mod = await import("node:path");
        return mod;
    }

    /** 简易 MIME 类型映射 */
    private mime(ext: string): string {
        const map: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".mjs": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".txt": "text/plain; charset=utf-8",
        };
        return map[ext] || "application/octet-stream";
    }
}
