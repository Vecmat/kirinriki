import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { Router } from "./router";
import { WELCOME, LOGO } from "../base/Constants";
import { container, BeanType, BeanScope } from "./container";
import { Logger } from "../kernel/logger";
import { Config } from "../kernel/config";
import { Cache } from "../kernel/cache";

/** Kirinriki 应用构造选项 */
export interface KirinrikiOptions {
    /** 为 true 时不打印启动 LOGO 与欢迎语 */
    silent?: boolean;
    /** 为 true 时在 init 后打印路由表格。也可通过环境变量 KIRINRIKI_PRINT_ROUTES=1 开启 */
    printRoutes?: boolean;
}

/**
 * 读取环境变量开关（兼容 Node 的 process.env 与 Deno 的 Deno.env）。
 * 值为 "1"、"true"、"yes"（不区分大小写）时视为开启。
 */
function envFlag(name: string): boolean {
    const env =
        (globalThis as any).process?.env ||
        (globalThis as any).Deno?.env?.toObject?.() ||
        {};
    const raw = String(env[name] || "").toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Kirinriki 应用核心。
 *
 * 框架只负责构建与导出 Hono 应用（fetch handler），
 * 不绑定任何具体运行时的监听逻辑，也不做文件系统扫描——
 * 因为 Cloudflare Workers 等环境不支持动态加载。
 *
 * 类的注册方式：在入口手动 import 各模块，
 * 装饰器在模块求值时自动把类注册进 IOC 容器（Node/Deno/Bun/Workers 通用）。
 */
export class Kirinriki {
    /** Hono 实例，各运行时兼容层以此作为 fetch 入口 */
    public readonly hono: Hono;
    private router: Router;
    /**
     * 运行时提供的 WebSocket 升级函数，由 {@link bindWebSocket} 注入。
     * 不同运行时来源不同：`hono/deno`、`hono/bun`、`hono/cloudflare-workers`
     * 或 `@hono/node-server`，框架不绑定具体运行时。
     */
    private upgradeWebSocket: UpgradeWebSocket<any, any> | undefined;

    /**
     * 注册中间件，直接映射到 Hono 的 `use`，签名完全一致。
     *
     * - `app.use(mw)`：注册全局中间件
     * - `app.use("/api/*", mw)`：注册路径级中间件
     * - `app.use(mw1, mw2)`：一次注册多个
     *
     * 需在 `init()` 之前调用，以保证中间件先于控制器路由生效。
     */
    public use: Hono["use"];

    /**
     * @param options 应用选项（silent / printRoutes）；也可传布尔值作为 silent
     */
    constructor(options: KirinrikiOptions | boolean = {}) {
        const opts: KirinrikiOptions =
            typeof options === "boolean" ? { silent: options } : options;
        const silent = opts.silent ?? false;
        // 路由表格开关：构造参数优先，其次环境变量 KIRINRIKI_PRINT_ROUTES
        const printRoutes =
            opts.printRoutes ?? envFlag("KIRINRIKI_PRINT_ROUTES");

        if (!silent) {
            console.log(LOGO);
            console.log(WELCOME);
        }

        this.hono = new Hono();
        // 绑定 Hono.use：保持其全部重载签名与 this 指向
        this.use = this.hono.use.bind(this.hono);
        this.router = new Router(this.hono, printRoutes);

        this.registerKernelServices();
    }

    /**
     * 绑定运行时 WebSocket 升级函数，供 `@OnOpen/@OnMessage/@OnClose/@OnError` 使用。
     *
     * 不同运行时的导入来源：
     * - Deno: `import { upgradeWebSocket } from "hono/deno"`
     * - Bun: `import { upgradeWebSocket } from "hono/bun"`
     * - Cloudflare Workers: `import { upgradeWebSocket } from "hono/cloudflare-workers"`
     * - Node.js: `import { upgradeWebSocket } from "@hono/node-server"`，
     *   且 `serve()` 需传入 `websocket: { server: new WebSocketServer({ noServer: true }) }`
     *
     * 必须在 `init()` 之前调用；未调用时，含 WebSocket 处理器的控制器路径会返回 501 并打印告警。
     *
     * @returns this，支持链式调用
     */
    bindWebSocket(upgradeWebSocket: UpgradeWebSocket<any, any>): this {
        this.upgradeWebSocket = upgradeWebSocket;
        return this;
    }

    /** 注册框架级 Kernel 服务（Logger / Config / Cache）到容器，所有应用可注入 */
    private registerKernelServices(): void {
        container.register({
            id: "Logger",
            clazz: Logger,
            type: BeanType.COMPONENT,
            scope: BeanScope.SINGLETON,
        });
        container.register({
            id: "Config",
            clazz: Config,
            type: BeanType.COMPONENT,
            scope: BeanScope.SINGLETON,
        });
        container.register({
            id: "Cache",
            clazz: Cache,
            type: BeanType.COMPONENT,
            scope: BeanScope.SINGLETON,
        });
    }

    /** 挂载容器中已注册的路由。需在导出/监听前 await 完成。
     *
     */
    async init(): Promise<this> {
        this.router.registerRoutes(this.upgradeWebSocket);
        return this;
    }

    /** Web 标准 fetch 处理器，等价于 hono.fetch，可直接交给任意兼容运行时 */
    get fetch(): (
        request: Request,
        ...args: any[]
    ) => Response | Promise<Response> {
        return this.hono.fetch;
    }
}
