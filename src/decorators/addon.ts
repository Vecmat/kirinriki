/**
 * `@Addon` —— Addon 身份注解。
 *
 * 把类声明为 Addon（name/version/description），类中可写
 * `onLoad` / `onUnload` 生命周期钩子。配套注解：
 * 配置声明 `@Config` 见 `./Config`，中间件声明/引用 `@Savant` / `@Use` 见 `./Savant`。
 *
 * 与其余装饰器不同，这些注解把元数据通过 `Reflect` 挂在**类本身**：
 * Addon 类通常位于框架之外的模块，其声明在模块求值时产生一次，
 * 不应随测试或其它场景的容器重置而丢失（容器只承载 Bean 定义与实例）。
 */
import "reflect-metadata";
import { ADDON_KEY } from "../core/define";

/** `@Addon` 的声明选项 */
export interface AddonOptions {
    /**
     * Addon 名（全局唯一），同时作为配置命名空间与中间件归属。
     * 省略时取类名：去掉尾部 "Addon" 后缀并把首字母小写
     * （`ResponseAddon` → `"response"`）。
     * 也可作为 `@Addon(name, opts)` 的第一个参数直接传入。
     */
    name?: string;
    /** Addon 版本（展示与诊断用） */
    version?: string;
    /** Addon 描述（展示与诊断用） */
    description?: string;
}

/** `@Addon(name, opts)` 第二参数的元信息（不含 name） */
export type AddonMetaOptions = Omit<AddonOptions, "name">;

/** `@Addon` 写入类的元数据 */
export interface AddonMeta {
    /** Addon 名（全局唯一），同时作为配置命名空间 */
    name: string;
    version?: string;
    description?: string;
}

/** 归一化默认 Addon 名：去尾部 "Addon" 后缀 + 首字母小写 */
export function defaultAddonName(clazz: { name: string }): string {
    const raw = /Addon$/.test(clazz.name)
        ? clazz.name.slice(0, -"Addon".length)
        : clazz.name;
    // 全名为 "Addon" 这类极端情况回退到原类名
    const base = raw || clazz.name;
    return base.charAt(0).toLowerCase() + base.slice(1);
}

/**
 * 声明一个类为 Addon。
 *
 * `name` 全局唯一并作为配置命名空间；`onLoad` / `onUnload` 为可选钩子方法。
 * 类通过 `app.addon(Clazz, options)` 或 `new Kirinriki({ addons: [Clazz] })`
 * 注册后才进入应用；实例由 IOC 容器创建，因此类里可以使用 `@Autowired`。
 *
 * ```ts
 * @Addon("metrics")                       // 显式命名
 * @Addon("metrics", { version: "1.0.0" }) // 名称 + 元信息
 * @Addon()                                // 类名 MetricsAddon ⇒ "metrics"
 * class MetricsAddon implements IAddon {
 *     async onLoad(scope: AddonScope) { ... }
 * }
 * ```
 */
export function Addon(
    nameOrOptions?: string | AddonOptions,
    meta?: AddonMetaOptions,
): ClassDecorator {
    return (target: any) => {
        const options: AddonOptions =
            typeof nameOrOptions === "string"
                ? { ...meta, name: nameOrOptions }
                : { ...nameOrOptions, ...meta };
        Reflect.defineMetadata(
            ADDON_KEY,
            {
                name: options.name || defaultAddonName(target),
                version: options.version,
                description: options.description,
            } satisfies AddonMeta,
            target,
        );
    };
}

/** 读取类上的 `@Addon` 声明；未声明返回 undefined */
export function addonMetaOf(clazz: any): AddonMeta | undefined {
    return (Reflect.getOwnMetadata(ADDON_KEY, clazz) as AddonMeta) ?? undefined;
}
