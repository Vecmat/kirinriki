import "reflect-metadata";
import { Kirinriki } from "../../src/core/app";
import type { KirinrikiAddon, AddonContext } from "../../src/core/addon";
import { registerConfig } from "../../src/core/config-registry";
import { resetGlobals, captureConsole } from "../helpers/reset";

/** 记录钩子执行轨迹的辅助 Addon */
function tracingAddon(
    name: string,
    trace: string[],
    extra: Partial<KirinrikiAddon> = {},
): KirinrikiAddon {
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

describe("Addon 生命周期", () => {
    beforeEach(() => resetGlobals());

    describe("注册", () => {
        it("app.addon() 链式注册", () => {
            const app = new Kirinriki({ silent: true });
            const ret = app.addon({ name: "a" }).addon({ name: "b" });
            expect(ret).toBe(app);
        });

        it("KirinrikiOptions.addons 预注册", () => {
            const app = new Kirinriki({
                silent: true,
                addons: [{ name: "a" }, { name: "b" }],
            });
            expect(app.init).toBeDefined();
        });

        it("同名 Addon 重复注册抛 ADDON_DUPLICATED", () => {
            const app = new Kirinriki({ silent: true });
            app.addon({ name: "dup" });
            expect(() => app.addon({ name: "dup" })).toThrow(
                'Addon "dup" 已注册',
            );
        });

        it("init() 之后注册抛 ADDON_TOO_LATE", async () => {
            const app = new Kirinriki({ silent: true });
            await app.init();
            expect(() => app.addon({ name: "late" })).toThrow(
                "必须在 init() 之前注册",
            );
        });
    });

    describe("加载（onLoad）", () => {
        it("init() 按注册顺序加载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon(tracingAddon("a1", trace));
            app.addon(tracingAddon("a2", trace));
            await app.init();
            expect(trace).toEqual(["load:a1", "load:a2"]);
        });

        it("无钩子 Addon 安全加载（最小 Addon 只需 name）", async () => {
            const app = new Kirinriki({
                silent: true,
                addons: [{ name: "bare" }],
            });
            await expect(app.init()).resolves.toBe(app);
        });

        it("onLoad 在 INIT 钩子之前执行", async () => {
            const order: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon({
                name: "a",
                onLoad: () => void order.push("addon:load"),
            });
            app.onInit(() => void order.push("hook:init"));
            await app.init();
            expect(order).toEqual(["addon:load", "hook:init"]);
        });

        it("onLoad 中可注册配置项并在 INIT 钩子前读取", async () => {
            const app = new Kirinriki({ silent: true });
            let seen: unknown;
            app.addon({
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
            app.addon({
                name: "bad",
                onLoad() {
                    throw new Error("boom");
                },
            });
            await expect(app.init()).rejects.toThrow("boom");
        });
    });

    describe("Addon 上下文（AddonContext）", () => {
        it("提供 app 实例、命名空间配置与私有 options", async () => {
            const app = new Kirinriki({ silent: true });
            let captured: AddonContext<{ size: number }> | undefined;
            app.addon<{ size: number }>(
                {
                    name: "ctx",
                    onLoad(ctx) {
                        captured = ctx;
                    },
                },
                { size: 42 },
            );
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
            registerConfig({
                key: "shared.greeting",
                type: "string",
                default: "hi",
            });
            registerConfig(
                { key: "mine.value", type: "string", default: "own" },
                "mine",
            );

            const app = new Kirinriki({ silent: true });
            let ownValue: unknown;
            let globalValue: unknown;
            let foreignError: unknown;
            app.addon({
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
            app.addon(tracingAddon("a1", trace));
            app.addon(tracingAddon("a2", trace));
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
            app.addon(tracingAddon("never-loaded", trace));
            // 未调用 init，直接 destroy
            await app.destroy();
            expect(trace).toEqual([]);
        });

        it("单个 Addon 卸载失败仅告警，不阻断其余 Addon 卸载", async () => {
            const trace: string[] = [];
            const app = new Kirinriki({ silent: true });
            app.addon(tracingAddon("good", trace));
            app.addon({
                name: "bad",
                onUnload() {
                    throw new Error("cleanup failed");
                },
            });
            app.addon(tracingAddon("good2", trace));
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
            const app = new Kirinriki({ silent: true });
            const contexts: AddonContext[] = [];
            app.addon(
                {
                    name: "ctxp",
                    onLoad: (ctx) => void contexts.push(ctx),
                    onUnload: (ctx) => void contexts.push(ctx),
                },
                { k: 1 },
            );
            await app.init();
            await app.destroy();
            expect(contexts).toHaveLength(2);
            expect(contexts[1].app).toBe(app);
            expect(contexts[1].options).toEqual({ k: 1 });
        });
    });
});
