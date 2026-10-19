import "reflect-metadata";
import { Kirinriki } from "../../src/core/app";
import type { AddonClass, AddonScope, IAddon } from "../../src/core/addon";
import { container } from "../../src/core/container";
import { Addon } from "../../src/decorators/addon";
import { Config } from "../../src/decorators/Config";
import { Savant, Use } from "../../src/decorators/Savant";
import { Controller } from "../../src/decorators/component";
import { Get } from "../../src/decorators/route";
import { configRegistry, registerConfig } from "../../src/core/config-registry";
import { MemoryConfigStore } from "../../src/kernel/config";
import { resetGlobals, captureConsole } from "../helpers/reset";

/** 生成记录 onLoad/onUnload 轨迹的 Addon 类（name 显式声明，便于断言） */
function tracer(name: string, trace: string[]): AddonClass {
    @Addon(name)
    class Tracer implements IAddon {
        onLoad(): void {
            trace.push(`load:${name}`);
        }
        onUnload(): void {
            trace.push(`unload:${name}`);
        }
    }
    return Tracer;
}

type Next = () => Promise<void>;

describe("Addon 生命周期", () => {
    beforeEach(() => resetGlobals());

    describe("注册", () => {
        it("app.addon() 链式注册（参数为 @Addon 类）", () => {
            @Addon("a")
            class A implements IAddon {}
            @Addon("b")
            class B implements IAddon {}

            const app = new Kirinriki({ silent: true });
            const ret = app.addon(A).addon(B);
            expect(ret).toBe(app);
            expect(app.addonManager.listNames()).toEqual(["a", "b"]);
        });

        it("KirinrikiOptions.addons 预注册并按序加载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({
                silent: true,
                addons: [tracer("a", trace), tracer("b", trace)],
            });
            await app.init();
            expect(trace).toEqual(["load:a", "load:b"]);
        });

        it("@Addon() 省略 name 时按类名推导（去 Addon 后缀 + 首字母小写）", async () => {
            @Addon()
            class MetricsAddon implements IAddon {}
            const app = new Kirinriki({
                silent: true,
                addons: [MetricsAddon],
            });
            await app.init();
            expect(app.addonManager.listNames()).toEqual(["metrics"]);
        });

        it("未使用 @Addon 装饰的类注册抛 ADDON_NOT_DECORATED", () => {
            class Plain implements IAddon {}
            const app = new Kirinriki({ silent: true });
            expect(() => app.addon(Plain)).toThrow("未使用 @Addon 装饰");
        });

        it("同名 Addon 重复注册抛 ADDON_DUPLICATED", () => {
            @Addon("dup")
            class Dup implements IAddon {}

            const app = new Kirinriki({ silent: true });
            app.addon(Dup);
            expect(() => app.addon(Dup)).toThrow('Addon "dup" 已注册');
        });

        it("init() 之后注册抛 ADDON_TOO_LATE", async () => {
            @Addon("late")
            class Late implements IAddon {}

            const app = new Kirinriki({ silent: true });
            await app.init();
            expect(() => app.addon(Late)).toThrow("必须在 init() 之前注册");
        });
    });

    describe("加载（onLoad）", () => {
        it("init() 按注册顺序加载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon(tracer("a1", trace));
            app.addon(tracer("a2", trace));
            await app.init();
            expect(trace).toEqual(["load:a1", "load:a2"]);
        });

        it("无钩子 Addon 安全加载（最小 Addon 只需 @Addon 类）", async () => {
            @Addon("bare")
            class Bare implements IAddon {}
            const app = new Kirinriki({ silent: true, addons: [Bare] });
            await expect(app.init()).resolves.toBe(app);
        });

        it("onLoad 在 INIT 钩子之前执行", async () => {
            const order: string[] = [];
            @Addon("a")
            class A implements IAddon {
                onLoad(): void {
                    order.push("addon:load");
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(A);
            app.onInit(() => void order.push("hook:init"));
            await app.init();
            expect(order).toEqual(["addon:load", "hook:init"]);
        });

        it("onLoad 中可通过 scope.config.register 声明配置项并在 INIT 钩子前读取", async () => {
            let seen: unknown;
            @Addon("cfg")
            class Cfg implements IAddon {
                async onLoad(scope: AddonScope): Promise<void> {
                    // owner 自动绑定为 "cfg"，无需重复写命名空间
                    scope.config.register({
                        key: "cfg.limit",
                        type: "number",
                        default: 10,
                    });
                    seen = await scope.config.get("cfg.limit");
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(Cfg);
            await app.init();
            expect(seen).toBe(10);
        });

        it("onLoad 抛错中断 init（配置错误应尽早暴露）", async () => {
            @Addon("bad")
            class Bad implements IAddon {
                onLoad(): void {
                    throw new Error("boom");
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(Bad);
            await expect(app.init()).rejects.toThrow("boom");
        });
    });

    describe("配置统一处理（@Config）", () => {
        it("类级 + 属性级声明在 config 阶段统一注册，并注入属性", async () => {
            @Addon("cfg-inject")
            @Config({ key: "cfg-inject.mode", type: "string", default: "prod" })
            class CfgAddon implements IAddon {
                @Config({ type: "number", default: 7 })
                limit!: number;
            }

            const app = new Kirinriki({
                silent: true,
                addons: [CfgAddon],
            });
            await app.init();

            // 类级声明：显式 key，归属本命名空间
            expect(configRegistry.get("cfg-inject.mode")).toMatchObject({
                key: "cfg-inject.mode",
                type: "string",
                owner: "cfg-inject",
                default: "prod",
            });
            // 属性级声明：key 自动拼接为 "<addonName>.<属性名>"
            expect(configRegistry.get("cfg-inject.limit")).toMatchObject({
                key: "cfg-inject.limit",
                owner: "cfg-inject",
            });
            // 解析后的值已注入实例属性（onLoad 中可直接 this.limit）
            const inst = container.get<CfgAddon>("cfg-inject")!;
            expect(inst.limit).toBe(7);
        });

        it("存储层的值优先于默认值并注入属性", async () => {
            const mem = new MemoryConfigStore("mem");
            await mem.set("cfg-store.limit", 99);

            @Addon("cfg-store")
            class StoreAddon implements IAddon {
                @Config({ type: "number", default: 1 })
                limit!: number;
            }

            const app = new Kirinriki({
                silent: true,
                addons: [StoreAddon],
                config: { stores: [mem] },
            });
            await app.init();

            const inst = container.get<StoreAddon>("cfg-store")!;
            expect(inst.limit).toBe(99);
        });
    });

    describe("Addon 作用域（AddonScope）", () => {
        it("提供 app 实例、命名空间配置与私有 options", async () => {
            let captured: AddonScope<{ size: number }> | undefined;
            @Addon("demo")
            class Demo implements IAddon<{ size: number }> {
                onLoad(scope: AddonScope<{ size: number }>): void {
                    captured = scope;
                }
            }

            const app = new Kirinriki({ silent: true });
            // app.addon 为泛型：T 由 Addon 类声明推导，options 受类型校验
            app.addon(Demo, { size: 42 });
            await app.init();

            expect(captured!.app).toBe(app);
            expect(captured!.options).toEqual({ size: 42 });
            expect(captured!.config.owner).toBe("demo");
        });

        it("注册选项自动赋给实例的 options（供 @Savant 中间件读取 this.options）", async () => {
            let captured: unknown;
            @Addon("opt")
            class Opt implements IAddon<{ size: number }> {
                onLoad(): void {
                    captured = this.options;
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(Opt, { size: 42 });
            await app.init();
            expect(captured).toEqual({ size: 42 });
        });

        it("scope 按模块暴露能力：container / config / middleware", async () => {
            let keys: string[] = [];
            let hasContainer = false;
            let hasMiddlewareFns = false;
            @Addon("modules")
            class Modules implements IAddon {
                onLoad(scope: AddonScope): void {
                    keys = Object.keys(scope).sort();
                    hasContainer =
                        typeof scope.container?.register === "function";
                    hasMiddlewareFns =
                        typeof scope.middleware?.register === "function" &&
                        typeof scope.middleware?.use === "function";
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Modules] });
            await app.init();
            expect(keys).toEqual([
                "app",
                "config",
                "container",
                "middleware",
                "options",
            ]);
            expect(hasContainer).toBe(true);
            expect(hasMiddlewareFns).toBe(true);
        });

        it("scope.config.register 声明项归属本命名空间（越权仍被拦截）", async () => {
            // 他人命名空间的配置项（用于验证越权读取被拦截）
            registerConfig(
                { key: "other.secret", type: "string", default: "s" },
                "other",
            );

            let foreignError: unknown;
            let registeredOwner: string | undefined;
            @Addon("reg")
            class Reg implements IAddon {
                async onLoad(scope: AddonScope): Promise<void> {
                    scope.config.register({
                        key: "reg.mine",
                        type: "string",
                        default: "v",
                    });
                    expect(await scope.config.get("reg.mine")).toBe("v");
                    // 注册后可反查 owner 归属
                    registeredOwner = scope.config.owner;
                    try {
                        await scope.config.get("other.secret");
                    } catch (err) {
                        foreignError = err;
                    }
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Reg] });
            await app.init();
            expect(registeredOwner).toBe("reg");
            expect((foreignError as any)?.errorKey).toBe("CONFIG_FORBIDDEN");
        });

        it("scope.config 命名空间隔离：可读自己与全局，越权抛 CONFIG_FORBIDDEN", async () => {
            registerConfig(
                { key: "auth.secret", type: "string", default: "s" },
                "auth",
            );
            registerConfig({
                key: "shared.greeting",
                type: "string",
                default: "hi",
            });
            registerConfig(
                { key: "mine.value", type: "string", default: "own" },
                "mine",
            );

            let ownValue: unknown;
            let globalValue: unknown;
            let foreignError: unknown;
            @Addon("mine")
            class Mine implements IAddon {
                async onLoad(scope: AddonScope): Promise<void> {
                    ownValue = await scope.config.get("mine.value");
                    globalValue = await scope.config.get("shared.greeting");
                    try {
                        await scope.config.get("auth.secret");
                    } catch (err) {
                        foreignError = err;
                    }
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Mine] });
            await app.init();

            expect(ownValue).toBe("own");
            expect(globalValue).toBe("hi");
            expect((foreignError as any)?.errorKey).toBe("CONFIG_FORBIDDEN");
        });
    });

    describe("卸载（onUnload）", () => {
        it("destroy() 按加载逆序卸载，且在 DESTROY 钩子之后", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon(tracer("a1", trace));
            app.addon(tracer("a2", trace));
            app.onDestroy(() => void trace.push("hook:destroy"));
            await app.init();
            await app.destroy();
            expect(trace).toEqual([
                "load:a1",
                "load:a2",
                "hook:destroy",
                "unload:a2",
                "unload:a1",
            ]);
        });

        it("未加载的 Addon 不触发卸载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon(tracer("never-loaded", trace));
            // 未调用 init，直接 destroy
            await app.destroy();
            expect(trace).toEqual([]);
        });

        it("单个 Addon 卸载失败仅告警，不阻断其余 Addon 卸载", async () => {
            const trace: string[] = [];
            @Addon("bad")
            class Bad implements IAddon {
                onUnload(): void {
                    throw new Error("cleanup failed");
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(tracer("good", trace));
            app.addon(Bad);
            app.addon(tracer("good2", trace));
            await app.init();

            const cap = captureConsole();
            try {
                await expect(app.destroy()).resolves.toBe(app);
            } finally {
                cap.restore();
            }
            expect(trace).toEqual([
                "load:good",
                "load:good2",
                "unload:good2",
                "unload:good",
            ]);
            // 显式断言告警按预期触发（避免噪音漏到 stderr）
            const warns = cap.logs.warn.map((a) => a.join(" ")).join("\n");
            expect(warns).toContain('Addon "bad" unload failed');
            expect(warns).toContain("cleanup failed");
        });

        it("onUnload 收到与 onLoad 一致的上下文", async () => {
            const contexts: AddonScope[] = [];
            @Addon("scoped")
            class Scoped implements IAddon<{ k: number }> {
                onLoad(scope: AddonScope<{ k: number }>): void {
                    contexts.push(scope);
                }
                onUnload(scope: AddonScope<{ k: number }>): void {
                    contexts.push(scope);
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(Scoped, { k: 1 });
            await app.init();
            await app.destroy();
            expect(contexts).toHaveLength(2);
            expect(contexts[1].app).toBe(app);
            expect(contexts[1].options).toEqual({ k: 1 });
        });
    });

    describe("中间件统一处理（@Savant / scope.middleware.use + priority）", () => {
        let trace: string[];

        /** 生成「@Savant 声明即全局启用」的 Addon 类（进出洋葱层时记录轨迹） */
        function mwAddon(name: string, priority: number): AddonClass {
            @Addon(name)
            class MwAddon implements IAddon {
                @Savant(name, { priority, global: true })
                async mw(_c: any, next: Next): Promise<void> {
                    trace.push(`enter:${name}`);
                    await next();
                    trace.push(`exit:${name}`);
                }
            }
            return MwAddon;
        }

        beforeEach(() => {
            trace = [];
        });

        it("@Savant(global: true) 的中间件按 priority 降序注入（大者在外层）", async () => {
            const app = new Kirinriki({ silent: true });
            app.addon(mwAddon("p10", 10));
            app.addon(mwAddon("p0", 0));
            app.addon(mwAddon("p5", 5));
            await app.init();
            // 无路由也执行中间件链（404 前），借洋葱进出序验证层级
            await app.fetch(new Request("http://localhost/any"));
            expect(trace).toEqual([
                "enter:p10",
                "enter:p5",
                "enter:p0",
                "exit:p0",
                "exit:p5",
                "exit:p10",
            ]);
        });

        it("priority 是中间件级的：同一 Addon 的多个 @Savant 可分别排序", async () => {
            @Addon("multi")
            class Multi implements IAddon {
                @Savant("low", { priority: 1, global: true })
                async low(_c: any, next: Next): Promise<void> {
                    trace.push("enter:low");
                    await next();
                    trace.push("exit:low");
                }

                @Savant("high", { priority: 9, global: true })
                async high(_c: any, next: Next): Promise<void> {
                    trace.push("enter:high");
                    await next();
                    trace.push("exit:high");
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Multi] });
            await app.init();
            await app.fetch(new Request("http://localhost/any"));
            expect(trace).toEqual([
                "enter:high",
                "enter:low",
                "exit:low",
                "exit:high",
            ]);
        });

        it("同 priority 按声明顺序注入", async () => {
            const app = new Kirinriki({ silent: true });
            app.addon(mwAddon("first", 0));
            app.addon(mwAddon("second", 0));
            await app.init();
            await app.fetch(new Request("http://localhost/any"));
            expect(trace).toEqual([
                "enter:first",
                "enter:second",
                "exit:second",
                "exit:first",
            ]);
        });

        it("@Savant 默认仅登记名称，onLoad 中按名启用", async () => {
            @Addon("static")
            class Static implements IAddon {
                @Savant("static-mw")
                async mw(_c: any, next: Next): Promise<void> {
                    trace.push("enter:static-mw");
                    await next();
                    trace.push("exit:static-mw");
                }

                onLoad(scope: AddonScope): void {
                    scope.middleware.use("static-mw", { priority: 5 });
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Static] });
            await app.init();
            await app.fetch(new Request("http://localhost/any"));
            expect(trace).toEqual(["enter:static-mw", "exit:static-mw"]);
        });

        it("@Savant 中间件以 Addon 实例为 this，可读 this.options 与 @Config 属性", async () => {
            @Addon("inst")
            class Inst implements IAddon<{ tag: string }> {
                @Config({
                    key: "inst.label",
                    type: "string",
                    default: "from-cfg",
                })
                label!: string;

                @Savant("inst-mw", { global: true, priority: 50 })
                async mw(c: any, next: Next): Promise<void> {
                    await next();
                    c.res = new Response(`${this.options?.tag}|${this.label}`, {
                        status: c.res.status,
                    });
                }
            }

            const app = new Kirinriki({ silent: true });
            app.addon(Inst, { tag: "opt" });
            await app.init();
            const res = await app.fetch(new Request("http://localhost/any"));
            expect(await res.text()).toBe("opt|from-cfg");
        });

        it("scope.middleware.use 未注册的名称抛 MIDDLEWARE_NOT_FOUND", async () => {
            @Addon("bad-ref")
            class BadRef implements IAddon {
                onLoad(scope: AddonScope): void {
                    scope.middleware.use("not-exists");
                }
            }

            const app = new Kirinriki({ silent: true, addons: [BadRef] });
            await expect(app.init()).rejects.toThrow(
                '中间件 "not-exists" 未注册',
            );
        });

        it("重复的 @Savant 名称抛 MIDDLEWARE_DUPLICATED", async () => {
            const noop = async (_c: any, next: Next): Promise<void> => {
                await next();
            };
            @Addon("a1")
            class A1 implements IAddon {
                @Savant("dup")
                async mw(_c: any, next: Next): Promise<void> {
                    await noop(_c, next);
                }
            }
            @Addon("a2")
            class A2 implements IAddon {
                @Savant("dup")
                async mw(_c: any, next: Next): Promise<void> {
                    await noop(_c, next);
                }
            }

            const app = new Kirinriki({ silent: true, addons: [A1, A2] });
            await expect(app.init()).rejects.toThrow(
                '中间件名称 "dup" 已被注册',
            );
        });

        it("手动 app.use 的中间件位于 Addon 启用中间件外层", async () => {
            const app = new Kirinriki({ silent: true });
            app.use(async (_c: any, next: Next) => {
                trace.push("enter:manual");
                await next();
                trace.push("exit:manual");
            });
            app.addon(mwAddon("addon-p100", 100));
            await app.init();
            await app.fetch(new Request("http://localhost/any"));
            expect(trace).toEqual([
                "enter:manual",
                "enter:addon-p100",
                "exit:addon-p100",
                "exit:manual",
            ]);
        });

        it("中间件在 INIT 钩子前完成注入（INIT 内请求即可触发）", async () => {
            let hit = false;
            let seenOnInit: boolean | undefined;
            @Addon("mw")
            class Mw implements IAddon {
                @Savant("mw", { global: true })
                async mw2(_c: any, next: Next): Promise<void> {
                    hit = true;
                    await next();
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Mw] });
            app.onInit(async () => {
                await app.fetch(new Request("http://localhost/any"));
                seenOnInit = hit;
            });
            await app.init();
            expect(seenOnInit).toBe(true);
        });

        it("onLoad 外调用 scope.middleware.use 抛 ADDON_USE_TOO_LATE", async () => {
            let captured: AddonScope | undefined;
            @Addon("late-use")
            class LateUse implements IAddon {
                onLoad(scope: AddonScope): void {
                    captured = scope;
                }
            }

            const app = new Kirinriki({ silent: true, addons: [LateUse] });
            await app.init();
            expect(() =>
                captured!.middleware.use(async (_c: any, next: Next) => {
                    await next();
                }),
            ).toThrow("只能在 onLoad 中");
            expect(() =>
                captured!.middleware.register(
                    "late-mw",
                    async (_c: any, next: Next) => {
                        await next();
                    },
                ),
            ).toThrow("scope.middleware");
        });

        it("init() 重复调用幂等（onLoad 不重复执行）", async () => {
            const loadTrace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon(tracer("once", loadTrace));
            await app.init();
            await app.init();
            expect(loadTrace).toEqual(["load:once"]);
        });
    });

    describe("工厂型中间件（@Savant factory + 绑定参数）", () => {
        /** 生成一个 @Savant 工厂 Addon：每次实例化记录 limit，请求时回显 */
        function limiterAddon(): {
            clazz: AddonClass;
            created: number[];
        } {
            const created: number[] = [];
            @Addon("limiter")
            class Limiter implements IAddon {
                @Savant("ratelimit", { factory: true })
                ratelimit(options?: { limit?: number }): any {
                    created.push(options?.limit ?? 1000);
                    return async (c: any, next: Next): Promise<void> => {
                        await next();
                        c.res = new Response(
                            `limit=${options?.limit ?? 1000}`,
                            { status: c.res.status },
                        );
                    };
                }
            }
            return { clazz: Limiter, created };
        }

        it("@Use(name, options) 按参数实例化：不同配置各自生效", async () => {
            const { clazz, created } = limiterAddon();
            @Controller("/api")
            class Ctrl {
                @Get("/big")
                @Use("ratelimit", { limit: 1000 })
                big() {
                    return { ok: true };
                }

                @Get("/small")
                @Use("ratelimit", { limit: 100 })
                small() {
                    return { ok: true };
                }
            }
            void Ctrl;

            const app = new Kirinriki({ silent: true });
            app.addon(clazz);
            await app.init();

            const big = await app.fetch(
                new Request("http://localhost/api/big"),
            );
            const small = await app.fetch(
                new Request("http://localhost/api/small"),
            );
            expect(await big.text()).toBe("limit=1000");
            expect(await small.text()).toBe("limit=100");
            // 两个绑定 → 两次实例化，各带各的参数
            expect(created).toEqual([1000, 100]);
        });

        it("相同 name + options 组合共享实例（注册期只实例化一次）", async () => {
            const { clazz, created } = limiterAddon();
            @Controller("/api")
            class Ctrl {
                @Get("/a")
                @Use("ratelimit", { limit: 100 })
                a() {
                    return { ok: true };
                }

                @Get("/b")
                @Use("ratelimit", { limit: 100 })
                b() {
                    return { ok: true };
                }
            }
            void Ctrl;

            const app = new Kirinriki({ silent: true });
            app.addon(clazz);
            await app.init();

            await app.fetch(new Request("http://localhost/api/a"));
            await app.fetch(new Request("http://localhost/api/b"));
            // 相同参数组合 → 只实例化一次（类级/方法级同配置同理共享）
            expect(created).toEqual([100]);
        });

        it("@Use(name) 无参引用工厂：以默认参数实例化", async () => {
            const { clazz, created } = limiterAddon();
            @Controller("/api")
            class Ctrl {
                @Get("/")
                @Use("ratelimit")
                ok() {
                    return { ok: true };
                }
            }
            void Ctrl;

            const app = new Kirinriki({ silent: true });
            app.addon(clazz);
            await app.init();

            const res = await app.fetch(new Request("http://localhost/api"));
            expect(await res.text()).toBe("limit=1000");
            expect(created).toEqual([1000]);
        });

        it("@Savant factory + global：收集阶段无参实例化并全局启用", async () => {
            const created: number[] = [];
            @Addon("gw")
            class Gateway implements IAddon {
                @Savant("gate", { factory: true, global: true, priority: 5 })
                gate(options?: { tag?: string }): any {
                    created.push(0);
                    return async (c: any, next: Next): Promise<void> => {
                        await next();
                        c.res = new Response(
                            `tag=${options?.tag ?? "default"}`,
                            { status: c.res.status },
                        );
                    };
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Gateway] });
            await app.init();
            const res = await app.fetch(
                new Request("http://localhost/anything"),
            );
            expect(await res.text()).toBe("tag=default");
            expect(created).toHaveLength(1); // 只实例化一次
        });

        it("本体型中间件被 @Use(name, options) 引用时忽略 options", async () => {
            let seen: string | undefined;
            @Addon("plain")
            class Plain implements IAddon {
                @Savant("plain-mw")
                async mw(c: any, next: Next): Promise<void> {
                    seen = "plain";
                    await next();
                    c.res = new Response("plain", { status: c.res.status });
                }
            }
            @Controller("/api")
            class Ctrl {
                @Get("/")
                @Use("plain-mw", { limit: 100 })
                ok() {
                    return { ok: true };
                }
            }
            void Ctrl;

            const app = new Kirinriki({ silent: true, addons: [Plain] });
            await app.init();
            const res = await app.fetch(new Request("http://localhost/api"));
            expect(await res.text()).toBe("plain");
            expect(seen).toBe("plain");
        });

        it("工厂 Addon 卸载后其名称与缓存实例一并清除", async () => {
            const { clazz } = limiterAddon();
            const app = new Kirinriki({ silent: true, addons: [clazz] });
            await app.init();
            expect(
                app.addonManager.resolveMiddleware("ratelimit", { limit: 1 }),
            ).toBeDefined();

            await app.destroy();
            expect(
                app.addonManager.resolveMiddleware("ratelimit", { limit: 1 }),
            ).toBeUndefined();
        });
    });

    describe("卸载时中间件清理", () => {
        it("destroy() 后 @Savant 中间件被摘除，不再拦截请求", async () => {
            @Addon("tag")
            class Tag implements IAddon {
                @Savant("tag-mw", { global: true, priority: 10 })
                async mw(c: any, next: Next): Promise<void> {
                    await next();
                    c.res = new Response("tagged", { status: c.res.status });
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Tag] });
            await app.init();
            const res1 = await app.fetch(new Request("http://localhost/any"));
            expect(await res1.text()).toBe("tagged");

            await app.destroy();
            const res2 = await app.fetch(new Request("http://localhost/any"));
            expect(await res2.text()).not.toBe("tagged");
        });

        it("卸载时先摘除中间件，再执行 onUnload（释放资源后中间件已不生效）", async () => {
            let taggedDuringUnload: boolean | undefined;
            const app = new Kirinriki({ silent: true });
            @Addon("tag")
            class Tag implements IAddon {
                @Savant("tag-mw", { global: true, priority: 10 })
                async mw(c: any, next: Next): Promise<void> {
                    await next();
                    c.res = new Response("tagged", { status: c.res.status });
                }
                async onUnload(): Promise<void> {
                    const r = await app.fetch(
                        new Request("http://localhost/any"),
                    );
                    taggedDuringUnload = (await r.text()) === "tagged";
                }
            }
            app.addon(Tag);
            await app.init();
            await app.destroy();
            expect(taggedDuringUnload).toBe(false);
        });

        it("卸载后命名中间件从注册表移除（resolveMiddleware 返回 undefined）", async () => {
            const { AddonManager } = await import("../../src/core/addon");
            @Addon("named")
            class Named implements IAddon {
                @Savant("named-mw")
                async mw(_c: any, next: Next): Promise<void> {
                    await next();
                }
            }

            const manager = new AddonManager();
            const app = new Kirinriki({ silent: true });
            manager.register(Named);
            manager.collectClasses();
            manager.collectMiddlewares();
            await manager.loadAll(app);
            expect(manager.resolveMiddleware("named-mw")).toBeDefined();

            await manager.unloadAll(app);
            expect(manager.resolveMiddleware("named-mw")).toBeUndefined();
        });

        it("init 失败重试不重复注入中间件", async () => {
            let attempts = 0;
            let hits = 0;
            @Addon("flaky")
            class Flaky implements IAddon {
                onLoad(scope: AddonScope): void {
                    scope.middleware.register(
                        "flaky-mw",
                        async (_c: any, next: Next) => {
                            hits++;
                            await next();
                        },
                    );
                    scope.middleware.use("flaky-mw");
                    attempts++;
                    if (attempts === 1) throw new Error("first-fail");
                }
            }

            const app = new Kirinriki({ silent: true, addons: [Flaky] });
            await expect(app.init()).rejects.toThrow("first-fail");
            await app.init(); // 重试成功

            await app.fetch(new Request("http://localhost/any"));
            await app.fetch(new Request("http://localhost/any"));
            expect(hits).toBe(2); // 若残留重复启用会累积为 4
        });
    });
});
