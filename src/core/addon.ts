import type { Kirinriki } from "./app";
import type { ScopedConfig } from "../kernel/config";
import { Exception } from "./exception";

/**
 * Addon 协议：扩展 kirinriki 应用的标准载体。
 *
 * Addon 拥有独立命名空间（`name`），通过 `app.addon(addon, options)` 或
 * `new Kirinriki({ addons })` 注册；生命周期由宿主应用驱动：
 *
 * - **加载**：`app.init()` 中，配置中心初始化之后、INIT 钩子之前
 *   （按注册顺序执行 `onLoad`；此时可注册配置项、Bean——路由尚未挂载）
 * - **卸载**：`app.destroy()` 中，DESTROY 钩子之后，
 *   按加载的**逆序**执行 `onUnload`（后加载的先卸载）
 *
 * 除生命周期与注入函数外，Addon 还可以**提供注解**：利用框架导出的
 * `InjectParams` 等复用函数在 Addon 模块内定义参数注解并直接 export，
 * 使用方从 Addon 导入即可（参见官方 session Addon `@vecmat/addon-session`
 * 的 `@ParamsSession()`，源码位于仓库 Addons/Session 目录）。
 *
 * 最小 Addon 只需 `name`，钩子均可省略：
 * ```ts
 * const myAddon: KirinrikiAddon<MyOptions> = {
 *     name: "my-addon",
 *     async onLoad(ctx) {
 *         registerConfig([{ key: "my-addon.limit", type: "number", default: 10 }], "my-addon");
 *         const limit = await ctx.config.get("my-addon.limit");
 *     },
 *     async onUnload(ctx) { /* 释放资源 *\/ },
 * };
 * app.addon(myAddon, { /* Addon 私有 options *\/ });
 * ```
 */
export interface KirinrikiAddon<TOptions = unknown> {
    /** Addon 名（全局唯一），同时作为配置命名空间 */
    name: string;
    /** Addon 版本 */
    version?: string;
    /** Addon 描述 */
    description?: string;
    /** 加载钩子：注册顺序执行，可异步 */
    onLoad?(ctx: AddonContext<TOptions>): void | Promise<void>;
    /** 卸载钩子：加载逆序执行，可异步；抛错仅告警，不阻断其他 Addon 卸载 */
    onUnload?(ctx: AddonContext<TOptions>): void | Promise<void>;
}

/** Addon 运行上下文：onLoad / onUnload 的入参 */
export interface AddonContext<TOptions = unknown> {
    /** 宿主应用实例 */
    app: Kirinriki;
    /**
     * Addon 私有命名空间配置（owner = Addon 名）。
     * 只能读写自己名下或主应用全局（无 owner）的已注册配置项，
     * 访问其他应用的配置会抛 CONFIG_FORBIDDEN。
     */
    config: ScopedConfig;
    /** 注册 Addon 时传入的私有选项（app.addon(addon, options)） */
    options: TOptions;
}

interface AddonRecord {
    addon: KirinrikiAddon<any>;
    options: unknown;
    loaded: boolean;
}

/** Addon 管理器：负责 Addon 的注册、按序加载与逆序卸载（宿主应用持有） */
export class AddonManager {
    private records: AddonRecord[] = [];
    private nameSet = new Set<string>();

    /** 已注册 Addon 数量 */
    get size(): number {
        return this.records.length;
    }

    /** 已注册 Addon 名（按注册顺序） */
    listNames(): string[] {
        return this.records.map((r) => r.addon.name);
    }

    /**
     * 注册 Addon（不触发钩子；加载由 loadAll 统一驱动）。
     * @throws ADDON_DUPLICATED 同名 Addon 重复注册
     */
    register(addon: KirinrikiAddon<any>, options?: unknown): void {
        if (this.nameSet.has(addon.name)) {
            throw new Exception(
                "ADDON_DUPLICATED",
                `Addon "${addon.name}" 已注册，name 必须唯一`,
                409,
            );
        }
        this.nameSet.add(addon.name);
        this.records.push({ addon, options, loaded: false });
    }

    /** 按注册顺序执行全部 onLoad */
    async loadAll(app: Kirinriki): Promise<void> {
        for (const record of this.records) {
            if (record.addon.onLoad) {
                await record.addon.onLoad(this.createContext(record, app));
            }
            record.loaded = true;
        }
    }

    /**
     * 按加载逆序执行全部 onUnload（后加载的先卸载）。
     * 单个 Addon 卸载失败仅告警，不阻断其余 Addon 卸载（保证 destroy 尽量完成）。
     */
    async unloadAll(app: Kirinriki): Promise<void> {
        for (const record of [...this.records].reverse()) {
            if (!record.loaded) continue;
            if (record.addon.onUnload) {
                try {
                    await record.addon.onUnload(
                        this.createContext(record, app),
                    );
                } catch (err: any) {
                    console.warn(
                        `[Kirinriki] Addon "${record.addon.name}" unload failed: ${err?.message || err}`,
                    );
                }
            }
            record.loaded = false;
        }
    }

    /** 构造 Addon 上下文：配置访问器绑定 Addon 命名空间 */
    private createContext(
        record: AddonRecord,
        app: Kirinriki,
    ): AddonContext<any> {
        return {
            app,
            config: app.config.scope(record.addon.name),
            options: record.options,
        };
    }
}
