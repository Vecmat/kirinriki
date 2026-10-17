import "reflect-metadata";
import { Kirinriki } from "../../src/core/app";
import type { KirinrikiPlugin, PluginContext } from "../../src/core/plugin";
import { registerConfig } from "../../src/core/config-registry";
import { resetGlobals } from "../helpers/reset";

/** 记录钩子执行轨迹的辅助插件 */
function tracingPlugin(
    name: string,
    trace: string[],
    extra: Partial<KirinrikiPlugin> = {},
): KirinrikiPlugin {
    return {
        name,
        onLoad() {
            trace.push(`load:${name}`);
        },
        onUnload() {
            trace.push(`unload:${name}`);
        },
        ...extra,
    };
}

describe("插件生命周期", () => {
    beforeEach(() => resetGlobals());

    describe("注册", () => {
        it("app.plugin() 链式注册", () => {
            const app = new Kirinriki({ silent: true });
            const ret = app.plugin({ name: "a" }).plugin({ name: "b" });
            expect(ret).toBe(app);
        });

        it("KirinrikiOptions.plugins 预注册", () => {
            const app = new Kirinriki({
                silent: true,
                plugins: [{ name: "a" }, { name: "b" }],
            });
            expect(app.init).toBeDefined();
        });

        it("同名插件重复注册抛 PLUGIN_DUPLICATED", () => {
            const app = new Kirinriki({ silent: true });
            app.plugin({ name: "dup" });
            expect(() => app.plugin({ name: "dup" })).toThrow(
                '插件 "dup" 已注册',
            );
        });

        it("init() 之后注册抛 PLUGIN_TOO_LATE", async () => {
            const app = new Kirinriki({ silent: true });
            await app.init();
            expect(() => app.plugin({ name: "late" })).toThrow(
                "必须在 init() 之前注册",
            );
        });
    });

    describe("加载（onLoad）", () => {
        it("init() 按注册顺序加载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.plugin(tracingPlugin("p1", trace));
            app.plugin(tracingPlugin("p2", trace));
            await app.init();
            expect(trace).toEqual(["load:p1", "load:p2"]);
        });

        it("无钩子插件安全加载（最小插件只需 name）", async () => {
            const app = new Kirinriki({ silent: true, plugins: [{ name: "bare" }] });
            await expect(app.init()).resolves.toBe(app);
        });

        it("onLoad 在 INIT 钩子之前执行", async () => {
            const order: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.plugin({
                name: "p",
                onLoad: () => void order.push("plugin:load"),
            });
            app.onInit(() => void order.push("hook:init"));
            await app.init();
            expect(order).toEqual(["plugin:load", "hook:init"]);
        });

        it("onLoad 中可注册配置项并在 INIT 钩子前读取", async () => {
            const app = new Kirinriki({ silent: true });
            let seen: unknown;
            app.plugin({
                name: "cfg",
                async onLoad(ctx) {
                    registerConfig(
                        { key: "cfg.limit", type: "number", default: 10 },
                        "cfg",
                    );
                    seen = await ctx.config.get("cfg.limit");
                },
            });
            await app.init();
            expect(seen).toBe(10);
        });

        it("onLoad 抛错中断 init（配置错误应尽早暴露）", async () => {
            const app = new Kirinriki({ silent: true });
            app.plugin({
                name: "bad",
                onLoad() {
                    throw new Error("boom");
                },
            });
            await expect(app.init()).rejects.toThrow("boom");
        });
    });

    describe("插件上下文（PluginContext）", () => {
        it("提供 app 实例、命名空间配置与私有 options", async () => {
            const app = new Kirinriki({ silent: true });
            let captured: PluginContext<{ size: number }> | undefined;
            app.plugin<{ size: number }>({
                name: "ctx",
                onLoad(ctx) {
                    captured = ctx;
                },
            }, { size: 42 });
            await app.init();

            expect(captured!.app).toBe(app);
            expect(captured!.options).toEqual({ size: 42 });
            expect(captured!.config.owner).toBe("ctx");
        });

        it("ctx.config 命名空间隔离：可读自己与全局，越权抛 CONFIG_FORBIDDEN", async () => {
            registerConfig(
                { key: "auth.secret", type: "string", default: "s" },
                "auth",
            );
            registerConfig({ key: "shared.greeting", type: "string", default: "hi" });
            registerConfig(
                { key: "mine.value", type: "string", default: "own" },
                "mine",
            );

            const app = new Kirinriki({ silent: true });
            let ownValue: unknown;
            let globalValue: unknown;
            let foreignError: unknown;
            app.plugin({
                name: "mine",
                async onLoad(ctx) {
                    ownValue = await ctx.config.get("mine.value");
                    globalValue = await ctx.config.get("shared.greeting");
                    try {
                        await ctx.config.get("auth.secret");
                    } catch (err) {
                        foreignError = err;
                    }
                },
            });
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
            app.plugin(tracingPlugin("p1", trace));
            app.plugin(tracingPlugin("p2", trace));
            app.onDestroy(() => void trace.push("hook:destroy"));
            await app.init();
            await app.destroy();
            expect(trace).toEqual([
                "load:p1",
                "load:p2",
                "hook:destroy",
                "unload:p2",
                "unload:p1",
            ]);
        });

        it("未加载的插件不触发卸载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.plugin(tracingPlugin("never-loaded", trace));
            // 未调用 init，直接 destroy
            await app.destroy();
            expect(trace).toEqual([]);
        });

        it("单个插件卸载失败仅告警，不阻断其余插件卸载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.plugin(tracingPlugin("good", trace));
            app.plugin({
                name: "bad",
                onUnload() {
                    throw new Error("cleanup failed");
                },
            });
            app.plugin(tracingPlugin("good2", trace));
            await app.init();
            await expect(app.destroy()).resolves.toBe(app);
            expect(trace).toEqual([
                "load:good",
                "load:good2",
                "unload:good2",
                "unload:good",
            ]);
        });

        it("onUnload 收到与 onLoad 一致的上下文", async () => {
            const app = new Kirinriki({ silent: true });
            const contexts: PluginContext[] = [];
            app.plugin({
                name: "ctxp",
                onLoad: (ctx) => void contexts.push(ctx),
                onUnload: (ctx) => void contexts.push(ctx),
            }, { k: 1 });
            await app.init();
            await app.destroy();
            expect(contexts).toHaveLength(2);
            expect(contexts[1].app).toBe(app);
            expect(contexts[1].options).toEqual({ k: 1 });
        });
    });
});
