import { createExampleApp } from "./app";
import type { UpgradeWebSocket } from "@vecmat/kirinriki";

async function main() {
    const port = Number((globalThis as any).process?.env?.PORT) || 3000;

    // 按运行时选择 WebSocket 升级函数（框架本身不绑定具体运行时）。
    // 使用变量形式的动态导入，避免跨运行时类型解析
    // （hono/deno 依赖 Deno 命名空间，Node 的 ws 为可选依赖）。
    const deno = (globalThis as any).Deno;
    const wsAdapterSpecifier = deno ? "hono/deno" : "@hono/node-server";
    const { upgradeWebSocket } = (await import(wsAdapterSpecifier)) as {
        upgradeWebSocket: UpgradeWebSocket;
    };
    if (deno) {
        console.log("Deno WebSocket 升级函数已加载");
    } else {
        console.log("Node.js / Bun WebSocket 升级函数已加载");
    }

    const app = createExampleApp(upgradeWebSocket);
    // 挂载容器中已注册的路由与静态资源
    await app.init();

    if (deno) {
        // Deno 原生 fetch handler（内置 WebSocket 支持，无需额外依赖）
        deno.serve({ port }, app.fetch);
        console.log(
            `Example server listening on http://localhost:${port} (deno)`,
        );
    } else {
        // Node.js / Bun：@hono/node-server 兼容层
        const { serve } = await import("@hono/node-server");

        // Node 下 WebSocket 还需 ws 提供的 WebSocketServer（npm i ws）
        let websocket: { server: unknown } | undefined;
        try {
            const wsModuleName = "ws";
            const { WebSocketServer } = (await import(wsModuleName)) as {
                WebSocketServer: new (options: {
                    noServer: boolean;
                }) => unknown;
            };
            websocket = {
                server: new WebSocketServer({ noServer: true }),
            };
        } catch {
            console.warn(
                '[example] 未安装 "ws" 包，Node.js 下 /link WebSocket 端点不可用（可执行 npm i ws 后重启）',
            );
        }

        serve(
            {
                fetch: app.fetch,
                port,
                ...(websocket ? { websocket } : {}),
            } as any,
            () => {
                console.log(
                    `Example server listening on http://localhost:${port}`,
                );
            },
        );
    }
}

main().catch(console.error);
