import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { Router } from "./router";
import { WELCOME, LOGO } from "../base/Constants";
import { container, BeanType, BeanScope } from "./container";
import { LifecycleEvent } from "./define";
import { runLifecycle, type LifecycleHookFn } from "./lifecycle";
import { AddonManager, type AddonClass } from "./addon";
import { Exception } from "./exception";
import { Logger } from "../kernel/logger";
import { Config, type ConfigOptions } from "../kernel/config";

/** Kirinriki 应用构造选项 */
export interface KirinrikiOptions {
    /** 为 true 时不打印启动 LOGO 与欢迎语 */
    silent?: boolean;
    /** 为 true 时在 init 后打印路由表格。也可通过环境变量 KIRINRIKI_PRINT_ROUTES=1 开启 */
    printRoutes?: boolean;
    /**
     * 配置中心选项（由主应用统一提供）：开放环境变量前缀（默认 OPEN_）
     * 与存储层列表（ConfigStore 实现，按顺序作为读取优先级）。
     * Redis/KV 等存储由应用或插件继承 ConfigStore 后注入。
     */
    config?: ConfigOptions;
    /** 预注册 Addon 类（等价逐一调用 app.addon()），init() 时按序分阶段加载 */
    addons?: AddonClass<any>[];
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

    /** 函数形式的生命周期钩子（通过 onInit/onReady/onDestroy 注册） */
    private lifecycleFns: Record<LifecycleEvent, LifecycleHookFn[]> = {
        [LifecycleEvent.INIT]: [],
        [LifecycleEvent.READY]: [],
        [LifecycleEvent.DESTROY]: [],
    };

    /** 配置中心选项（构造时传入，init() 时生效） */
    private configOptions?: ConfigOptions;

    /**
     * Addon 管理器：承载 Addon 注册与加载/卸载生命周期。
     * 公开可访问——Addon 通过 `scope.app.addonManager` 触及它，
     * 未来框架的扩展能力（如新增管理器）也从此处挂载，无需改动 AddonScope 接口。
     */
    public addonManager = new AddonManager();

    /** 应用是否已完成 init()；init 后禁止再注册 Addon */
    private inited = false;

    /**
     * 注册中间件，直接映射到 Hono 的 `use`，签名完全一致。
     *
     * - `app.use(mw)`：注册全局中间件
     * - `app.use("/api/*", mw)`：注册路径级中间件
     * - `app.use(mw1, mw2)`：一次注册多个
     *
     * 需在 `init()` 之前调用，以保证中间件先于控制器路由生效。
     * 层级说明：此处注册的中间件位于 Addon 启用中间件（`scope.middleware.use`，
     * init 时按 priority 统一注入）的**外层**。
     */
    public use: Hono["use"];

    /**
     * @param options 应用选项（silent / printRoutes）；也可传布尔值作为 silent
     */
    constructor(options: KirinrikiOptions | boolean = {}) {
        const opts: KirinrikiOptions =
            typeof options === "boolean" ? { silent: options } : options;
        const silent = opts.silent ?? false;
        this.configOptions = opts.config;
        for (const addonClazz of opts.addons ?? []) {
            this.addonManager.register(addonClazz);
        }
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
        this.router = new Router(this.hono, printRoutes, (name, options) =>
            this.addonManager.resolveMiddleware(name, options),
        );

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

    /**
     * 注册框架级 Kernel 服务（Logger / ConfigService）到容器，所有应用可注入。
     * 配置服务容器标识为 "ConfigService"：`Config` 这个名字已被
     * `@Config` 注解占用，避免 Addon 中 `import { Config }` 拿到错误的东西。
     */
    private registerKernelServices(): void {
        container.register({
            id: "Logger",
            clazz: Logger,
            type: BeanType.COMPONENT,
            scope: BeanScope.SINGLETON,
        });
        container.register({
            id: "ConfigService",
            clazz: Config,
            type: BeanType.COMPONENT,
            scope: BeanScope.SINGLETON,
        });
    }

    /**
     * 注册函数形式的 INIT 生命周期钩子（路由注册前执行）。
     * Bean 方法钩子（@OnInit）先于函数钩子执行。
     * @returns this，支持链式调用
     */
    onInit(fn: LifecycleHookFn): this {
        this.lifecycleFns[LifecycleEvent.INIT].push(fn);
        return this;
    }

    /**
     * 注册函数形式的 READY 生命周期钩子（路由注册后执行）。
     * Bean 方法钩子（@OnReady）先于函数钩子执行。
     * @returns this，支持链式调用
     */
    onReady(fn: LifecycleHookFn): this {
        this.lifecycleFns[LifecycleEvent.READY].push(fn);
        return this;
    }

    /**
     * 注册函数形式的 DESTROY 生命周期钩子（destroy() 时执行）。
     * Bean 方法钩子（@OnDestroy）先于函数钩子执行。
     * @returns this，支持链式调用
     */
    onDestroy(fn: LifecycleHookFn): this {
        this.lifecycleFns[LifecycleEvent.DESTROY].push(fn);
        return this;
    }

    /**
     * 配置中心服务（主应用统一读取/修改配置的入口）。
     * 等价于 `container.get<ConfigService>("ConfigService")`；
     * Kernel 服务在构造时注册，必然存在。
     */
    get config(): Config {
        const config = container.get<Config>("ConfigService");
        if (!config) {
            throw new Exception(
                "INTERNAL_ERROR",
                "Config service is not registered; Kirinriki constructor must run first.",
                500,
            );
        }
        return config;
    }

    /**
     * 注册 Addon 类（须在 init() 之前）。
     *
     * Addon 在 init() 时**按阶段统一处理**：实例化 → 收集 `@Config` 注册配置
     * 并注入属性 → 收集 `@Savant` 登记中间件 → 执行 onLoad → 注入中间件；
     * destroy() 时按逆序卸载。
     *
     * @param clazz `@Addon` 标注的类（name 全局唯一，同时作为配置命名空间）；
     *              实例由 IOC 容器创建，因此类中可使用 `@Autowired`
     * @param options Addon 私有选项，经 `scope.options` 与 `this.options` 提供；
     *                泛型 T 由 Addon 类声明推导，此处会做类型校验
     * @returns this，支持链式调用
     * @throws ADDON_NOT_DECORATED 类未使用 @Addon 装饰
     * @throws ADDON_DUPLICATED 同名 Addon 重复注册
     * @throws ADDON_TOO_LATE init() 之后注册
     */
    addon<T = unknown>(clazz: AddonClass<T>, options?: T): this {
        if (this.inited) {
            throw new Exception(
                "ADDON_TOO_LATE",
                `Addon "${clazz?.name}" 必须在 init() 之前注册`,
                409,
            );
        }
        this.addonManager.register(clazz, options);
        return this;
    }

    /**
     * 启动应用，按固定阶段推进（顺序可预期、Addon 之间互不干扰）：
     *
     * 1. 初始化配置中心（stores / env 就绪）
     * 2. **加载所有 Addon 类**：容器实例化（`@Autowired` 装配）
     * 3. **统一处理 config**：收集全部 `@Config` → 注册进配置中心 →
     *    注入属性（Addon 的 `this.xxx` 与 `scope.config.get()` 此时可用）
     * 4. **统一处理中间件**：收集全部 `@Savant` → 登记名称 →
     *    `global: true` 的进入注入队列
     * 5. **加载 Addon**：按注册顺序执行 `onLoad(scope)`
     * 6. **注入中间件**：按 priority 降序统一注入 Hono（先于路由注册）
     * 7. INIT 钩子 → 挂载路由 → READY 钩子
     *
     * 配置与 Addon 均在 INIT 钩子前就绪，钩子里即可使用配置中心。
     * 需在导出/监听前 await 完成。重复调用幂等（已 init 时直接返回）；
     * 中途失败可重试——各阶段自带幂等标记，仅补齐未完成的部分。
     */
    async init(): Promise<this> {
        if (this.inited) return this;
        this.config.init(this.configOptions);
        // ① 加载所有类 ②统一处理配置 ③统一处理中间件
        this.addonManager.collectClasses();
        await this.addonManager.collectConfigs(this);
        this.addonManager.collectMiddlewares();
        // ④ 加载 Addon（onLoad）
        await this.addonManager.loadAll(this);
        // ⑤ 统一注入中间件：priority 降序（越大越外层）；
        //    此刻路由尚未注册，因此包裹全部路由
        this.addonManager.applyMiddleware(this.hono);
        await runLifecycle(
            LifecycleEvent.INIT,
            this,
            this.lifecycleFns[LifecycleEvent.INIT],
        );
        this.router.registerRoutes(this.upgradeWebSocket);
        await runLifecycle(
            LifecycleEvent.READY,
            this,
            this.lifecycleFns[LifecycleEvent.READY],
        );
        this.inited = true;
        return this;
    }

    /**
     * 销毁应用：执行全部 DESTROY 钩子（Bean 的 @OnDestroy 方法 + onDestroy 函数）
     * → 卸载 Addon（onUnload，加载逆序）。
     * 用于优雅关闭（释放连接、停止后台任务）；框架不持有监听句柄，
     * 停止监听由运行时负责，destroy 只处理业务资源清理。
     */
    async destroy(): Promise<this> {
        await runLifecycle(
            LifecycleEvent.DESTROY,
            this,
            this.lifecycleFns[LifecycleEvent.DESTROY],
        );
        await this.addonManager.unloadAll(this);
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
