import app from "./app";

// 手动 import 各模块以触发装饰器注册。
// Cloudflare Workers 等环境不支持动态加载，这是所有运行时统一的注册方式
import "./controller/user.controller";
import "./aspect/log.aspect";
import "./service/user.service";

async function main() {
    // 挂载容器中已注册的路由
    await app.init();

    const port = Number((globalThis as any).process?.env?.PORT) || 3000;

    // 按运行时选择监听方式：框架只导出 fetch 处理器
    const deno = (globalThis as any).Deno;
    if (deno) {
        // Deno 原生 fetch handler
        deno.serve({ port }, app.fetch);
        console.log(`Example server listening on http://localhost:${port} (deno)`);
    } else {
        // Node.js / Bun：@hono/node-server 兼容层
        const { serve } = await import("@hono/node-server");
        serve({ fetch: app.fetch, port }, () => {
            console.log(`Example server listening on http://localhost:${port}`);
        });
    }
}

main().catch(console.error);
