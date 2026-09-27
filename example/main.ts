import app from "./app";

async function main() {
    // 挂载容器中已注册的路由与静态资源
    await app.init();

    const port = Number((globalThis as any).process?.env?.PORT) || 3000;

    // 按运行时选择监听方式：框架只导出 fetch 处理器
    const deno = (globalThis as any).Deno;
    if (deno) {
        // Deno 原生 fetch handler
        deno.serve({ port }, app.fetch);
        console.log(
            `Example server listening on http://localhost:${port} (deno)`,
        );
    } else {
        // Node.js / Bun：@hono/node-server 兼容层
        const { serve } = await import("@hono/node-server");
        serve({ fetch: app.fetch, port }, () => {
            console.log(`Example server listening on http://localhost:${port}`);
        });
    }
}

main().catch(console.error);
