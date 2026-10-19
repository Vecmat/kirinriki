/**
 * Savant —— 命名中间件机制（声明侧 + 引用侧）。
 *
 * 沿用旧版框架的 `base/Savant.ts` 词汇：`Savant`（声明）与 `Use`（引用）
 * 是同一机制的两半，因此放在同一文件：
 *
 * - `@Savant(name, opts?)`：**Addon 侧声明**——把某个类方法声明为中间件，
 *   方法本身就是 `(c, next) => Promise<void>`（`factory: true` 时为**中间件工厂**）；
 *   由 AddonManager 在中间件收集阶段统一登记名称，`global: true` 声明即全局启用
 * - `@Use(target, options?)`：**控制器侧引用**——按名引用（可携带绑定参数，
 *   工厂型中间件按参数实例化）或直接绑定内联函数，作用于标记的方法或整个控制器
 * - `@Before(fn)` / `@After(fn)`：内联引用的**便捷钩子**——只在 handler 前/后
 *   执行一段逻辑（无需自己调用 `next()`），等价于 `@Use` 内联形式的切片写法
 *
 * 与 `@Addon` / `@Config` 一样，声明元数据通过 `Reflect` 挂在**类本身**，
 * 不随容器重置而丢失（`@Use` 引用元数据仍走容器 propertyStore，随路由解析）。
 */
import "reflect-metadata";
import type { Context, MiddlewareHandler } from "hono";
import { container } from "../core/container";
import { MIDDLEWARE_KEY, SAVANT_KEY } from "../core/define";
import { Exception } from "../core/exception";
import { classOf, ownMeta, pushMeta } from "./meta";

/** `@Savant` 的声明选项 */
export interface SavantOptions {
    /**
     * 优先级：数值越大越先注入（洋葱越外层），默认 0；
     * 同优先级按声明顺序。仅在该中间件全局启用时影响注入顺序。
     */
    priority?: number;
    /**
     * 是否随声明自动全局启用（默认 false）。
     * false 时仅登记名称，由控制器 `@Use("name")` 引用，
     * 或在 `onLoad` 中用 `scope.middleware.use("name", { priority })` 动态启用。
     */
    global?: boolean;
    /**
     * 声明为**中间件工厂**（默认 false）：方法签名变为
     * `(options?) => MiddlewareHandler`，由 `@Use("name", options)` 引用时
     * 按参数实例化——同名中间件在不同绑定处可用不同配置、各自持有状态
     * （如限流阈值 1000/分钟与 100/分钟各一个计数器）。
     * 相同 `name + options` 组合共享同一实例（路由注册期缓存）。
     * `global: true` 时在收集阶段以无参调用实例化并入全局队列。
     */
    factory?: boolean;
}

/** `@Savant` 写入类的中间件声明 */
export interface SavantDefinition {
    /** 中间件名称（全局唯一） */
    name: string;
    /** 承载中间件的类方法名 */
    method: string;
    /** 优先级（越大越外层） */
    priority: number;
    /** 是否随声明全局启用 */
    global: boolean;
    /** 方法是否为中间件工厂 */
    factory: boolean;
}

/**
 * 声明类方法为中间件。
 *
 * 被标注的方法**本身**就是中间件：`(c, next) => Promise<void>`，
 * 以 Addon 实例为 `this`（因此可直接读取 `this.options` 与 `@Config` 属性）；
 * `factory: true` 时方法为**工厂**：`(options?) => MiddlewareHandler`，
 * 由 `@Use("name", options)` 按参数实例化（绑定参数）。
 *
 * ```ts
 * @Addon()
 * class TraceAddon implements IAddon {
 *     @Savant("trace", { global: true, priority: 10 })
 *     async trace(c: Context, next: () => Promise<void>) {
 *         const t0 = Date.now();
 *         await next();
 *         console.log("cost", Date.now() - t0);
 *     }
 * }
 *
 * // 工厂形态：同一中间件，不同绑定处不同配置
 * @Addon("limiter")
 * class LimiterAddon implements IAddon {
 *     @Savant("ratelimit", { factory: true })
 *     ratelimit(options?: { limit?: number }): MiddlewareHandler {
 *         const limit = options?.limit ?? 1000;
 *         const counter = new Map<string, number>();   // 每个绑定实例独立状态
 *         return async (c, next) => { /* 按 limit 限流 *\/ await next(); };
 *     }
 * }
 *
 * // 使用：@Use("ratelimit", { limit: 1000 }) 与 @Use("ratelimit", { limit: 100 })
 * ```
 */
export function Savant(
    name: string,
    options: SavantOptions = {},
): MethodDecorator {
    return (target: any, propertyKey: string | symbol) => {
        if (!name) {
            throw new Exception(
                "ADDON_SAVANT_NAMELESS",
                "@Savant 需要显式提供中间件名称",
                500,
            );
        }
        pushMeta<SavantDefinition>(SAVANT_KEY, classOf(target), {
            name,
            method: String(propertyKey),
            priority: options.priority ?? 0,
            global: options.global ?? false,
            factory: options.factory ?? false,
        });
    };
}

/** 读取类上的全部 `@Savant` 声明（按声明顺序） */
export function listSavants(clazz: any): SavantDefinition[] {
    return ownMeta<SavantDefinition>(SAVANT_KEY, clazz);
}

/** @Use 写入的中间件引用元数据（命名引用与内联函数二选一） */
export interface UseMiddlewareDefinition {
    /** AddonManager 中登记的中间件名称（与 handler 二选一） */
    name?: string;
    /** 内联中间件函数（与 name 二选一） */
    handler?: MiddlewareHandler;
    /**
     * 绑定参数（仅命名引用时生效）：中间件为工厂形态时按此实例化；
     * 本体形态时忽略。相同 name + options 组合共享实例。
     */
    options?: Record<string, unknown>;
}

/**
 * `@Before` / `@After` 钩子函数签名：接收 Hono Context。
 * `@After` 中可通过 `c.res` 读取（`clone()` 后）或替换响应。
 */
export type AspectHook = (c: Context) => void | Promise<void>;

/**
 * 前置钩子：方法执行**前**调用（原 AOP `@Before` 的保留形态）。
 *
 * 等价于 `@Use(async (c, next) => { await fn(c); await next(); })` 的切片写法，
 * 无需自己调用 `next()`；需要短路或改写请求流程时请用 `@Use(fn)`。
 * 仅可用于方法（作用于标记的方法）；异常会正常冒泡（钩子抛错即中断请求）。
 *
 * ```ts
 * @Controller("/api")
 * class ApiController {
 *     @Before((c) => console.log("[Before]", c.req.method, c.req.path))
 *     @Get("/data")
 *     getData() { return { ok: true }; }
 * }
 * ```
 */
export function Before(fn: AspectHook): MethodDecorator {
    return Use(async (c, next) => {
        await fn(c);
        await next();
    }) as MethodDecorator;
}

/**
 * 后置钩子：handler 执行**之后**调用（原 AOP `@After` 的保留形态）。
 *
 * 等价于 `@Use(async (c, next) => { await next(); await fn(c); })` 的切片写法；
 * 可通过 `c.res`（读取请先 `clone()`）检查响应，或直接替换 `c.res` 改写响应。
 * 注意：路由异常处理（`@Catched`）在洋葱层**内**把异常转成错误响应，
 * 因此 handler 抛异常时本钩子**仍会执行**（读到错误响应）；
 * 需要区分正常/异常收尾请用 `@Use(fn)` 自行 try/catch。
 *
 * ```ts
 * @Controller("/api")
 * class ApiController {
 *     @After(async (c) => console.log("[After]", c.res.status))
 *     @Get("/data")
 *     getData() { return { ok: true }; }
 * }
 * ```
 */
export function After(fn: AspectHook): MethodDecorator {
    return Use(async (c, next) => {
        await next();
        await fn(c);
    }) as MethodDecorator;
}
/**
 * 给控制器方法/整个控制器绑定中间件。
 *
 * 三种引用形式（合并了原 AOP 切面的能力——Before/After 语义由
 * 内联函数在 `await next()` 前后自然表达）：
 *
 * 1. `@Use("name")`：按名引用 Addon 声明（@Savant）或注册
 *    （scope.middleware.register）的中间件
 * 2. `@Use("name", options)`：带绑定参数引用——中间件为工厂形态
 *    （`@Savant(name, { factory: true })`）时按 options 实例化，
 *    同名不同配置各自持有独立状态
 * 3. `@Use(fn)`：直接绑定内联中间件（原先 `@Around(fn)` 的用法）
 *
 * 另有 `@Before(fn)` / `@After(fn)` 便捷钩子（本文件内实现）：
 * 只需在前/后执行一段逻辑时无需自己调用 `next()`。
 *
 * 作用于标记的方法或整个控制器（类级 + 方法级同时存在时类级先执行）。
 * 名称在路由注册期解析（Addon 已加载完毕）；未登记抛 MIDDLEWARE_NOT_FOUND。
 * 与 Addon 全局启用的中间件独立——同一中间件被全局启用且又被 @Use
 * 引用时会执行两次，请只用一种方式。
 *
 * ```ts
 * @Controller("/admin")
 * @Use("auth")                     // 整个控制器
 * class AdminController {
 *     @Get("/audit")
 *     @Use("ratelimit", { limit: 100 })   // 绑定参数：100 次/分钟
 *     @Use(async (c, next) => {            // 内联：next() 前后即 before/after
 *         console.log("start", c.req.path);
 *         await next();
 *         console.log("done", c.res.status);
 *     })
 *     audit() { return { ok: true }; }
 * }
 * ```
 */
export function Use(
    target: string | MiddlewareHandler,
    options?: Record<string, unknown>,
): ClassDecorator & MethodDecorator {
    return ((t: any, propertyKey?: string | symbol) => {
        const def: UseMiddlewareDefinition =
            typeof target === "string"
                ? { name: target, options }
                : { handler: target };
        if (propertyKey === undefined) {
            // 类装饰器：整个控制器启用
            container.attachPropertyData(MIDDLEWARE_KEY, def, t);
        } else {
            // 方法装饰器：单个方法启用
            container.attachPropertyData(MIDDLEWARE_KEY, def, t, propertyKey);
        }
    }) as ClassDecorator & MethodDecorator;
}
