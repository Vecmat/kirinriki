import type { Hono, MiddlewareHandler } from "hono";
import type { Kirinriki } from "./app";
import { BeanScope, BeanType, container, type Container } from "./container";
import { addonMetaOf } from "../decorators/addon";
import { listConfigs } from "../decorators/Config";
import { listSavants } from "../decorators/Savant";
import type { ScopedConfig } from "../kernel/config";
import { Exception } from "./exception";

/**
 * Addon 协议：扩展 kirinriki 应用的标准载体。
 *
 * Addon 是**用注解声明的类**：`@Addon` 声明身份，`@Savant` 声明中间件方法，
 * `@Config` 声明配置项；`onLoad` / `onUnload` 为可选的生命周期钩子。
 * 注册入口为 `app.addon(Clazz, options)` 或 `new Kirinriki({ addons: [Clazz] })`。
 *
 * 宿主应用在 `init()` 中**按阶段统一处理**全部 Addon（顺序固定、可预期）：
 *
 * 1. **加载所有类**：容器实例化（支持 `@Autowired`），此时尚无任何副作用
 * 2. **统一处理 config**：收集全部 `@Config` 声明 → 注册进配置中心
 *    （owner = Addon 名）→ 把解析后的值注入声明它的实例属性
 * 3. **统一处理中间件**：收集全部 `@Savant` → 登记名称（供 `@Use` 引用），
 *    声明了 `global: true` 的进入全局注入队列（按 priority 排序）
 * 4. **加载 Addon**：按注册顺序执行 `onLoad(scope)`——此时配置已就绪、
 *    中间件名称已登记，钩子内可读写配置、注册 Bean、动态启用中间件
 * 5. **注入中间件**：`applyMiddleware` 在路由注册前统一注入 Hono
 * 6. **启动**：INIT 钩子 → 挂载路由 → READY 钩子
 *
 * 卸载发生在 `destroy()` 中（DESTROY 钩子之后）：按加载的**逆序**执行
 * `onUnload`，并自动摘除该 Addon 的中间件与注册的名称。
 *
 * 最小 Addon 只需 `@Addon()` 标注的类，钩子与注解均可省略：
 *
 * ```ts
 * @Addon()
 * class MyAddon implements IAddon {
 *     @Config({ type: "number", default: 10 }) limit!: number;
 *     @Savant("my-mw", { global: true, priority: 10 })
 *     async mw(c: Context, next: () => Promise<void>) {
 *         if (this.limit > 0) { ... }
 *         await next();
 *     }
 *     async onLoad(scope: AddonScope) {
 *         scope.container.register({ ... });          // 注册自己提供的 Bean
 *         scope.middleware.use("my-mw", { priority: 5 }); // 也可在钩子里动态启用
 *     }
 * }
 * app.addon(MyAddon, { /* Addon 私有 options *\/ });
 * ```
 */
export interface IAddon<TOptions = unknown> {
    /**
     * Addon 私有选项：`app.addon(Clazz, options)` 传入，框架在加载类阶段
     * 自动赋给实例（传入 undefined 时不动类内默认值）。
     * 供 `@Savant` 中间件方法（只拿到 `(c, next)`）与 `onLoad` 中的
     * `this` 直接读取；钩子里也可以用 `scope.options`。
     */
    options?: TOptions;
    /**
     * 加载钩子：注册顺序执行，可异步。
     * 此时配置项已注册、`@Config` 属性已注入、`@Savant` 名称已登记。
     */
    onLoad?(scope: AddonScope<TOptions>): void | Promise<void>;
    /** 卸载钩子：加载逆序执行，可异步；抛错仅告警，不阻断其他 Addon 卸载 */
    onUnload?(scope: AddonScope<TOptions>): void | Promise<void>;
}

/** Addon 类构造器（`@Addon` 标注、可选实现 {@link IAddon} 钩子） */
export type AddonClass<TOptions = unknown> = new (
    ...args: any[]
) => IAddon<TOptions>;

/** scope.middleware.use 的启用选项 */
export interface UseMiddlewareOptions {
    /**
     * 中间件优先级：数值越大越先注入（洋葱越外层），默认 0；
     * 同优先级按声明顺序。优先级是**中间件级**的，与所属 Addon 无关。
     */
    priority?: number;
    /**
     * 绑定参数（仅按名启用时生效）：中间件为工厂形态
     * （`@Savant(name, { factory: true })`）时按此实例化；本体形态时忽略。
     */
    options?: Record<string, unknown>;
}

/** scope.middleware 中间件能力模块 */
export interface AddonMiddlewareModule {
    /**
     * 注册命名中间件（仅注册，不启用；仅可在 onLoad 中调用）。
     * 名称全局唯一，重复注册抛 MIDDLEWARE_DUPLICATED。
     * `@Savant` 声明的中间件已由框架在 loadAll 之前自动登记，
     * 此处无需重复注册；仅在钩子中**动态创建**的中间件才需要调用。
     */
    register(name: string, mw: MiddlewareHandler): void;
    /**
     * 全局启用中间件（仅可在 onLoad 中调用）。
     * - 传名称：启用已登记的中间件（`@Savant` 声明的或本钩子注册的；
     *   未登记抛 MIDDLEWARE_NOT_FOUND）；工厂型中间件按 options 实例化
     * - 传函数：直接启用匿名中间件（不可被 @Use 引用）
     *
     * 启用不立即生效：init() 在全部 Addon 加载完成后按各中间件的
     * priority 降序统一注入 Hono（先注入 = 洋葱外层）。
     * 卸载时框架自动摘除该 Addon 启用的全部中间件及其注册的名称。
     */
    use(
        target: string | MiddlewareHandler,
        options?: UseMiddlewareOptions,
    ): void;
}

/**
 * Addon 作用域：`onLoad` / `onUnload` 的入参。
 *
 * 它是应用在**装载期**暴露给插件的能力集合（外立面），按模块组织——
 * `config` 配置模块、`middleware` 中间件模块、`container` 容器模块。
 * 插件因此**无需从框架导入能力函数**：声明配置项用 `scope.config.register`，
 * 注册中间件用 `scope.middleware.register`，不必再 import `registerConfig` 等。
 *
 * 框架后续新增子系统（事件总线、任务调度器等）只需在此追加模块字段，
 * 已有 Addon 实现不受影响；同时以独立对象而非直接传 `app` 的形式提供，
 * 避免插件越权访问应用内部——需要管理器时用 `scope.app.addonManager`。
 *
 * 命名刻意避开 `ctx`：请求处理层的 `ctx` / `c` 是 Hono Context，
 * 此处的 `scope` 是装载期作用域，二者在代码中一眼可辨。
 */
export interface AddonScope<TOptions = unknown> {
    /** 宿主应用实例（`scope.app.addonManager` 为其 Addon 管理器） */
    app: Kirinriki;
    /** IOC 容器：注册/解析 Bean（如向容器注册本插件提供的服务） */
    container: Container;
    /**
     * 配置模块：读写本命名空间配置（get/set），
     * 以及声明本插件的配置项（register，owner 自动绑定，无需写自己的名字）。
     * 只能读写自己名下或主应用全局（无 owner）的已注册配置项，
     * 访问其他命名空间的配置会抛 CONFIG_FORBIDDEN。
     */
    config: ScopedConfig;
    /** 中间件模块：注册命名中间件 / 全局启用 */
    middleware: AddonMiddlewareModule;
    /** 注册 Addon 时传入的私有选项（app.addon(Clazz, options)） */
    options: TOptions;
}

/** 中间件队列/存活列表条目 */
interface MiddlewareEntry {
    mw: MiddlewareHandler;
    priority: number;
    /** 声明或启用该中间件的 Addon 名（卸载摘除用） */
    addon: string;
    /** 启用序号：同优先级按此稳定排序 */
    seq: number;
    /**
     * 是否由 `@Savant` 静态声明（true）还是 `scope.middleware.use` 动态启用（false）。
     * 重试加载时只清除动态条目，静态声明保持有效。
     */
    declared: boolean;
}

/**
 * 已登记的命名中间件：本体（mw）或工厂（factory）二选一。
 * - 本体：`@Savant` 普通声明 / `scope.middleware.register` 注册
 * - 工厂：`@Savant(name, { factory: true })`，方法为
 *   `(options?) => MiddlewareHandler`，由引用方（@Use / scope.middleware.use）
 *   按参数实例化——同名中间件不同配置各自持有状态
 */
interface NamedMiddleware {
    /** 本体中间件（与 factory 二选一） */
    mw?: MiddlewareHandler;
    /** 中间件工厂（与 mw 二选一），以 Addon 实例为 this */
    factory?: (options?: Record<string, unknown>) => MiddlewareHandler;
    /** 归属 Addon 名 */
    addon: string;
    /** 是否由 `@Savant` 静态声明 */
    declared: boolean;
}

interface AddonRecord {
    clazz: AddonClass<any>;
    /** Addon 名（`@Addon` 声明，全局唯一，同时作为配置命名空间） */
    name: string;
    version?: string;
    description?: string;
    options: unknown;
    /** 容器创建的实例（`@Autowired` 已装配） */
    instance?: any;
    loaded: boolean;
}

/**
 * Addon 管理器：负责 Addon 的登记与分阶段生命周期编排（宿主应用持有）。
 *
 * 阶段方法由 `Kirinriki.init()` 依序调用：
 * {@link collectClasses} → {@link collectConfigs} → {@link collectMiddlewares}
 * → {@link loadAll} → {@link applyMiddleware}；`destroy()` 调用 {@link unloadAll}。
 */
export class AddonManager {
    private records: AddonRecord[] = [];
    private nameSet = new Set<string>();
    /** 命名中间件注册表：名称 → 实现与来源 Addon（@Use 注解按名解析） */
    private middlewareRegistry = new Map<string, NamedMiddleware>();
    /** 待接管的中间件队列：收集阶段填充，applyMiddleware 时统一排序注入 */
    private middlewareQueue: MiddlewareEntry[] = [];
    /** 当前存活的 Addon 中间件（priority 排序后），请求期由分发洋葱层动态执行 */
    private activeMiddleware: MiddlewareEntry[] = [];
    /** 是否已注册分发洋葱层（只注册一次；卸载通过摘除存活条目实现） */
    private dispatchRegistered = false;
    private mwSeq = 0;
    /** 阶段幂等标记：init() 失败重试时避免重复实例化/注册/声明 */
    private classesCollected = false;
    private configsCollected = false;
    private middlewaresCollected = false;
    /** loadAll 期间指向当前加载中的记录，用于限定 scope.middleware.use 的合法调用窗口 */
    private loadingRecord: AddonRecord | null = null;

    /** 已注册 Addon 数量 */
    get size(): number {
        return this.records.length;
    }

    /** 已注册 Addon 名（按注册顺序） */
    listNames(): string[] {
        return this.records.map((r) => r.name);
    }

    /**
     * 登记 Addon 类（不触发任何钩子；加载由 init() 的分阶段流程驱动）。
     * 同时把类登记进 IOC 容器（{@link BeanType.ADDON} 单例）——
     * 实例由容器创建，因此 Addon 类可使用 `@Autowired`。
     *
     * @throws ADDON_NOT_DECORATED 类未使用 `@Addon` 装饰
     * @throws ADDON_DUPLICATED 同名 Addon 重复登记
     */
    register(clazz: AddonClass<any>, options?: unknown): void {
        const meta = addonMetaOf(clazz);
        if (!meta) {
            throw new Exception(
                "ADDON_NOT_DECORATED",
                `Addon 类 "${clazz?.name}" 未使用 @Addon 装饰`,
                500,
            );
        }
        if (this.nameSet.has(meta.name)) {
            throw new Exception(
                "ADDON_DUPLICATED",
                `Addon "${meta.name}" 已注册，name 必须唯一`,
                409,
            );
        }
        this.nameSet.add(meta.name);
        if (!container.has(meta.name)) {
            container.register({
                id: meta.name,
                clazz,
                type: BeanType.ADDON,
                scope: BeanScope.SINGLETON,
            });
        }
        this.records.push({
            clazz,
            name: meta.name,
            version: meta.version,
            description: meta.description,
            options,
            loaded: false,
        });
    }

    /**
     * 阶段①：加载所有 Addon 类——由容器实例化（`@Autowired` 装配在容器内完成）。
     * 此阶段不产生任何外部副作用，仅把「类」变成「可用的实例」。
     */
    collectClasses(): void {
        if (this.classesCollected) return;
        for (const record of this.records) {
            record.instance = container.get(record.name);
            if (!record.instance) {
                throw new Exception(
                    "ADDON_INSTANTIATE_FAILED",
                    `Addon "${record.name}" 实例化失败（容器中不存在该 Bean）`,
                    500,
                );
            }
            // 注册选项交给实例（供 this.options 读取；未传时保留类内默认值）
            if (record.options !== undefined) {
                record.instance.options = record.options;
            }
        }
        this.classesCollected = true;
    }

    /**
     * 阶段②：统一处理配置——收集全部 `@Config` 声明，注册进配置中心
     * （owner 自动绑定为 Addon 名），并把解析后的值注入声明它的实例属性。
     * 需在配置中心 init 之后、`onLoad` 之前调用。
     */
    async collectConfigs(app: Kirinriki): Promise<void> {
        if (this.configsCollected) return;
        for (const record of this.records) {
            const config = app.config.scope(record.name);
            for (const def of listConfigs(record.clazz)) {
                const key =
                    def.key ||
                    (def.propertyKey
                        ? `${record.name}.${def.propertyKey}`
                        : "");
                if (!key) {
                    throw new Exception(
                        "ADDON_CONFIG_KEYLESS",
                        `Addon "${record.name}" 的类级 @Config 必须显式提供 key`,
                        500,
                    );
                }
                // 声明进配置中心：owner 自动绑定为本 Addon 命名空间
                config.register({
                    key,
                    type: def.type,
                    default: def.default,
                    description: def.description,
                });
                // 属性级声明：把解析后的值注入实例，onLoad 中可直接 this.xxx 读取
                if (!def.propertyKey) continue;
                const value = await config.get(key);
                if (value !== undefined) {
                    record.instance[def.propertyKey] = value;
                }
            }
        }
        this.configsCollected = true;
    }

    /**
     * 阶段③：统一处理中间件——收集全部 `@Savant` 声明，
     * 登记名称（供 `@Use` 按名引用）：本体直接绑定实例方法；
     * 工厂（`factory: true`）登记工厂函数，待引用方按参数实例化。
     * 声明了 `global: true` 的在收集阶段实例化并入全局队列，
     * 待 `applyMiddleware` 按 priority 统一注入。
     */
    collectMiddlewares(): void {
        if (this.middlewaresCollected) return;
        for (const record of this.records) {
            for (const def of listSavants(record.clazz)) {
                if (def.factory) {
                    // 工厂形态：登记工厂，按引用时的 options 实例化
                    const factory = (options?: Record<string, unknown>) =>
                        this.bindFactory(record, def.method, options);
                    this.registerNamed(
                        record.name,
                        { factory },
                        def.name,
                        true,
                    );
                    if (def.global) {
                        this.middlewareQueue.push({
                            // 全局启用无绑定参数：无参实例化
                            mw: factory(undefined),
                            priority: def.priority,
                            addon: record.name,
                            seq: this.mwSeq++,
                            declared: true,
                        });
                    }
                } else {
                    const mw = this.bindSavant(record, def.method);
                    this.registerNamed(record.name, { mw }, def.name, true);
                    if (def.global) {
                        this.middlewareQueue.push({
                            mw,
                            priority: def.priority,
                            addon: record.name,
                            seq: this.mwSeq++,
                            declared: true,
                        });
                    }
                }
            }
        }
        this.middlewaresCollected = true;
    }

    /** 按注册顺序执行全部 onLoad（跳过已加载记录，init 重试安全） */
    async loadAll(app: Kirinriki): Promise<void> {
        for (const record of this.records) {
            if (record.loaded) continue;
            // 重试安全：清掉该记录上次 onLoad 失败时可能残留的**动态**注册与启用，
            // @Savant 静态声明保持有效（收集阶段一次性完成，不再重复）
            this.purgeDynamicOf(record.name);
            if (typeof record.instance?.onLoad === "function") {
                this.loadingRecord = record;
                try {
                    await record.instance.onLoad(this.createScope(record, app));
                } finally {
                    this.loadingRecord = null;
                }
            }
            record.loaded = true;
        }
    }

    /**
     * 接管队列中的中间件：按 priority 降序（越大越外层）、同级按声明顺序
     * 存入 activeMiddleware，并向 Hono 注册**唯一的分发洋葱层**——请求期
     * 按当前存活列表逐层执行（Hono 不支持反注册，卸载时摘除对应条目即可）。
     * 调用方须保证此时路由尚未注册。重复调用只补充新增声明，不重复注册。
     */
    applyMiddleware(hono: Hono): void {
        if (this.middlewareQueue.length === 0) return;
        const sorted = [...this.middlewareQueue].sort(
            (a, b) => b.priority - a.priority || a.seq - b.seq,
        );
        this.middlewareQueue = [];
        // 重试场景下保留先前已接管的条目，仅追加新增声明
        this.activeMiddleware = this.dispatchRegistered
            ? [...this.activeMiddleware, ...sorted]
            : sorted;
        if (this.dispatchRegistered || this.activeMiddleware.length === 0)
            return;
        hono.use("*", async (c: any, next: () => Promise<void>) => {
            // 请求开始时取快照：卸载摘除不影响进行中的请求
            const list = this.activeMiddleware;
            const run = async (i: number): Promise<void> => {
                if (i >= list.length) {
                    await next();
                    return;
                }
                await list[i].mw(c, () => run(i + 1));
            };
            await run(0);
        });
        this.dispatchRegistered = true;
    }

    /**
     * 按加载逆序执行全部 onUnload（后加载的先卸载）。
     * 每个记录卸载时**先摘除**其全部中间件（含 `@Savant` 声明的）与注册的名称
     * （先于 onUnload 释放资源，保证资源释放后中间件不再被请求触发）。
     * 单个 Addon 卸载失败仅告警，不阻断其余 Addon 卸载（保证 destroy 尽量完成）。
     */
    async unloadAll(app: Kirinriki): Promise<void> {
        for (const record of [...this.records].reverse()) {
            if (!record.loaded) continue;
            this.purgeAllOf(record.name);
            if (typeof record.instance?.onUnload === "function") {
                try {
                    await record.instance.onUnload(
                        this.createScope(record, app),
                    );
                } catch (err: any) {
                    console.warn(
                        `[Kirinriki] Addon "${record.name}" unload failed: ${err?.message || err}`,
                    );
                }
            }
            record.loaded = false;
        }
    }

    /** 摘除指定 Addon 的**动态**中间件与名称（onLoad 重试前调用；静态声明保留） */
    private purgeDynamicOf(addon: string): void {
        this.activeMiddleware = this.activeMiddleware.filter(
            (e) => !(e.addon === addon && !e.declared),
        );
        this.middlewareQueue = this.middlewareQueue.filter(
            (e) => !(e.addon === addon && !e.declared),
        );
        for (const [name, entry] of this.middlewareRegistry) {
            if (entry.addon === addon && !entry.declared) {
                this.middlewareRegistry.delete(name);
                this.clearFactoryCache(name);
            }
        }
    }

    /** 摘除指定 Addon 的全部中间件与名称（卸载时调用） */
    private purgeAllOf(addon: string): void {
        this.activeMiddleware = this.activeMiddleware.filter(
            (e) => e.addon !== addon,
        );
        this.middlewareQueue = this.middlewareQueue.filter(
            (e) => e.addon !== addon,
        );
        for (const [name, entry] of this.middlewareRegistry) {
            if (entry.addon === addon) {
                this.middlewareRegistry.delete(name);
                this.clearFactoryCache(name);
            }
        }
    }

    /**
     * 按名解析中间件（Router 处理 `@Use` 注解、scope.middleware.use 时调用）。
     * - 本体：直接返回（忽略 options）
     * - 工厂：按 `name + options` 组合实例化并缓存——相同组合共享实例
     *   （如类级与方法级 @Use 配置相同则共用一个限流计数器）
     * 未登记返回 undefined。
     */
    resolveMiddleware(
        name: string,
        options?: Record<string, unknown>,
    ): MiddlewareHandler | undefined {
        const named = this.middlewareRegistry.get(name);
        if (!named) return undefined;
        if (named.mw) return named.mw;
        const cacheKey = `${name}|${this.stableStringify(options)}`;
        let mw = this.factoryCache.get(cacheKey);
        if (!mw) {
            mw = named.factory!(options);
            this.factoryCache.set(cacheKey, mw);
        }
        return mw;
    }

    /** 工厂实例缓存：key 为 `name|stable(options)`，同一组合复用实例 */
    private factoryCache = new Map<string, MiddlewareHandler>();

    /** 清除某名称工厂的全部缓存实例（名称摘除时调用） */
    private clearFactoryCache(name: string): void {
        const prefix = `${name}|`;
        for (const key of this.factoryCache.keys()) {
            if (key.startsWith(prefix)) this.factoryCache.delete(key);
        }
    }

    /** options 的稳定序列化（键排序，保证相同配置得到相同缓存键） */
    private stableStringify(value: unknown): string {
        if (value === null || typeof value !== "object") return String(value);
        if (Array.isArray(value))
            return `[${value.map((v) => this.stableStringify(v)).join(",")}]`;
        const keys = Object.keys(value as object).sort();
        return `{${keys
            .map(
                (k) =>
                    `${JSON.stringify(k)}:${this.stableStringify(
                        (value as Record<string, unknown>)[k],
                    )}`,
            )
            .join(",")}}`;
    }

    /** 绑定 `@Savant` 声明的实例方法为中间件处理器 */
    private bindSavant(record: AddonRecord, method: string): MiddlewareHandler {
        const fn = record.instance?.[method];
        if (typeof fn !== "function") {
            throw new Exception(
                "ADDON_SAVANT_MISSING",
                `Addon "${record.name}" 的 @Savant 中间件方法 "${method}" 不存在`,
                500,
            );
        }
        return fn.bind(record.instance);
    }

    /** 调用工厂方法（以 Addon 实例为 this）产出中间件 */
    private bindFactory(
        record: AddonRecord,
        method: string,
        options?: Record<string, unknown>,
    ): MiddlewareHandler {
        const fn = record.instance?.[method];
        if (typeof fn !== "function") {
            throw new Exception(
                "ADDON_SAVANT_MISSING",
                `Addon "${record.name}" 的 @Savant 工厂方法 "${method}" 不存在`,
                500,
            );
        }
        return fn.call(record.instance, options);
    }

    /** 登记命名中间件：名称全局唯一（本体或工厂二选一） */
    private registerNamed(
        addon: string,
        entry: Pick<NamedMiddleware, "mw" | "factory">,
        name: string,
        declared: boolean,
    ): void {
        if (this.middlewareRegistry.has(name)) {
            throw new Exception(
                "MIDDLEWARE_DUPLICATED",
                `中间件名称 "${name}" 已被注册（Addon "${addon}"）`,
                409,
            );
        }
        this.middlewareRegistry.set(name, { ...entry, addon, declared });
    }

    /** 全局启用中间件：仅限该记录的 onLoad 窗口内调用 */
    private declareMiddleware(
        record: AddonRecord,
        target: string | MiddlewareHandler,
        options?: UseMiddlewareOptions,
    ): void {
        if (this.loadingRecord !== record) {
            throw new Exception(
                "ADDON_USE_TOO_LATE",
                `Addon "${record.name}" 只能在 onLoad 中通过 scope.middleware.use 启用中间件`,
                409,
            );
        }
        let mw: MiddlewareHandler;
        if (typeof target === "string") {
            const resolved = this.resolveMiddleware(target, options?.options);
            if (!resolved) {
                throw new Exception(
                    "MIDDLEWARE_NOT_FOUND",
                    `中间件 "${target}" 未注册（Addon "${record.name}" scope.middleware.use）`,
                    409,
                );
            }
            mw = resolved;
        } else {
            mw = target;
        }
        this.middlewareQueue.push({
            mw,
            priority: options?.priority ?? 0,
            addon: record.name,
            seq: this.mwSeq++,
            declared: false,
        });
    }

    /** 构造 Addon 作用域：把框架各模块的能力绑定到该 Addon */
    private createScope(record: AddonRecord, app: Kirinriki): AddonScope<any> {
        const addonName = record.name;
        return {
            app,
            // 容器模块：插件可向容器注册自己提供的 Bean
            container,
            // 配置模块：owner 自动绑定本 Addon 命名空间（读取 + 声明）
            config: app.config.scope(addonName),
            // 中间件模块：注册命名中间件 / 全局启用（仅 onLoad 窗口内可用）
            middleware: {
                register: (name, mw) => {
                    this.assertLoading(record, "register");
                    this.registerNamed(addonName, { mw }, name, false);
                },
                use: (target, options) =>
                    this.declareMiddleware(record, target, options),
            },
            options: record.options,
        };
    }

    /** 校验调用阶段：中间件操作仅限该记录的 onLoad 窗口 */
    private assertLoading(record: AddonRecord, action: string): void {
        if (this.loadingRecord !== record) {
            throw new Exception(
                "ADDON_USE_TOO_LATE",
                `Addon "${record.name}" 只能在 onLoad 中通过 scope.middleware.${action} 操作中间件`,
                409,
            );
        }
    }
}
