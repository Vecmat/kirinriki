import type { Kirinriki } from "./app";
import type { ScopedConfig } from "../kernel/config";
import { Exception } from "./exception";

/**
 * 插件协议：扩展 kirinriki 应用的标准载体。
 *
 * 插件拥有独立命名空间（`name`），通过 `app.plugin(plugin, options)` 或
 * `new Kirinriki({ plugins })` 注册；生命周期由宿主应用驱动：
 *
 * - **加载**：`app.init()` 中，配置中心初始化之后、INIT 钩子之前
 *   （按注册顺序执行 `onLoad`；此时可注册配置项、Bean，甚至控制器——路由尚未挂载）
 * - **卸载**：`app.destroy()` 中，DESTROY 钩子之后，
 *   按加载的**逆序**执行 `onUnload`（后加载的先卸载）
 *
 * 最小插件只需 `name`，钩子均可省略：
 * ```ts
 * const myPlugin: KirinrikiPlugin<MyOptions> = {
 *     name: "my-plugin",
 *     async onLoad(ctx) {
 *         registerConfig([{ key: "myPlugin.limit", type: "number", default: 10 }], "my-plugin");
 *         const limit = await ctx.config.get("myPlugin.limit");
 *     },
 *     async onUnload(ctx) { /* 释放资源 *\/ },
 * };
 * app.plugin(myPlugin, { /* 插件私有 options *\/ });
 * ```
 */
export interface KirinrikiPlugin<TOptions = unknown> {
    /** 插件名（全局唯一），同时作为配置命名空间 */
    name: string;
    /** 插件版本 */
    version?: string;
    /** 插件描述 */
    description?: string;
    /** 加载钩子：注册顺序执行，可异步 */
    onLoad?(ctx: PluginContext<TOptions>): void | Promise<void>;
    /** 卸载钩子：加载逆序执行，可异步；抛错仅告警，不阻断其他插件卸载 */
    onUnload?(ctx: PluginContext<TOptions>): void | Promise<void>;
}

/** 插件运行上下文：onLoad / onUnload 的入参 */
export interface PluginContext<TOptions = unknown> {
    /** 宿主应用实例 */
    app: Kirinriki;
    /**
     * 插件私有命名空间配置（owner = 插件名）。
     * 只能读写自己名下或主应用全局（无 owner）的已注册配置项，
     * 访问其他应用的配置会抛 CONFIG_FORBIDDEN。
     */
    config: ScopedConfig;
    /** 注册插件时传入的私有选项（app.plugin(plugin, options)） */
    options: TOptions;
}

interface PluginRecord {
    plugin: KirinrikiPlugin<any>;
    options: unknown;
    loaded: boolean;
}

/** 插件管理器：负责插件的注册、按序加载与逆序卸载（宿主应用持有） */
export class PluginManager {
    private records: PluginRecord[] = [];
    private nameSet = new Set<string>();

    /** 已注册插件数量 */
    get size(): number {
        return this.records.length;
    }

    /** 已注册插件名（按注册顺序） */
    listNames(): string[] {
        return this.records.map((r) => r.plugin.name);
    }

    /**
     * 注册插件（不触发钩子；加载由 loadAll 统一驱动）。
     * @throws PLUGIN_DUPLICATED 同名插件重复注册
     */
    register(plugin: KirinrikiPlugin<any>, options?: unknown): void {
        if (this.nameSet.has(plugin.name)) {
            throw new Exception(
                "PLUGIN_DUPLICATED",
                `插件 "${plugin.name}" 已注册，插件名必须唯一`,
                409,
            );
        }
        this.nameSet.add(plugin.name);
        this.records.push({ plugin, options, loaded: false });
    }

    /** 按注册顺序执行全部 onLoad */
    async loadAll(app: Kirinriki): Promise<void> {
        for (const record of this.records) {
            if (record.plugin.onLoad) {
                await record.plugin.onLoad(this.createContext(record, app));
            }
            record.loaded = true;
        }
    }

    /**
     * 按加载逆序执行全部 onUnload（后加载的先卸载）。
     * 单个插件卸载失败仅告警，不阻断其余插件卸载（保证 destroy 尽量完成）。
     */
    async unloadAll(app: Kirinriki): Promise<void> {
        for (const record of [...this.records].reverse()) {
            if (!record.loaded) continue;
            if (record.plugin.onUnload) {
                try {
                    await record.plugin.onUnload(
                        this.createContext(record, app),
                    );
                } catch (err: any) {
                    console.warn(
                        `[Kirinriki] Plugin "${record.plugin.name}" unload failed: ${err?.message || err}`,
                    );
                }
            }
            record.loaded = false;
        }
    }

    /** 构造插件上下文：配置访问器绑定插件命名空间 */
    private createContext(
        record: PluginRecord,
        app: Kirinriki,
    ): PluginContext<any> {
        return {
            app,
            config: app.config.scope(record.plugin.name),
            options: record.options,
        };
    }
}
