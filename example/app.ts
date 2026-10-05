import "reflect-metadata";

import { Kirinriki, StaticService } from "@vecmat/kirinriki";
import type { UpgradeWebSocket } from "@vecmat/kirinriki";

// 各模块在被 import 时通过装饰器自动注册到 IOC 容器
import "./index";
// 子应用：每个应用的 index.ts 负责加载本应用全部模块
import "./apps/auth";
import "./apps/payment";
import "./apps/test";
// 根级别 WebSocket 示例：/link
import "./apps/link";

/**
 * 创建示例应用。
 *
 * WebSocket 升级函数由运行时入口（main.ts）按平台注入：
 * - Deno: `import { upgradeWebSocket } from "hono/deno"`
 * - Node: `import { upgradeWebSocket } from "@hono/node-server"`
 * - Bun: `import { upgradeWebSocket } from "hono/bun"`
 *
 * printRoutes: true 开启路由表格打印；也可用环境变量 KIRINRIKI_PRINT_ROUTES=1
 */

export function createExampleApp(websocket?: UpgradeWebSocket): Kirinriki {
    const app = new Kirinriki({ printRoutes: true, websocket });
    // 静态资源由应用自行绑定（框架不再自动挂载）：
    // 将各子应用 @App({ staticDir }) 声明的目录挂到 /{appHash}/*
    new StaticService(app.hono).mountAll();
    return app;
}
