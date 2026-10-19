/**
 * `@Config` —— Addon 配置声明注解。
 *
 * 把配置项的**声明**交给框架统一收集：归属本 Addon 命名空间
 * （owner 自动绑定，无需写自己的名字），框架在 config 阶段
 * （配置中心就绪后、`onLoad` 之前）统一注册并注入属性值。
 *
 * 与 `@Addon` / `@Savant` 一样，声明元数据通过 `Reflect` 挂在**类本身**，
 * 不随容器重置而丢失。
 */
import type { ConfigValueType } from "../core/config-registry";
import { CONFIG_KEY } from "../core/define";
import { classOf, ownMeta, pushMeta } from "./meta";

/** `@Config` 的声明内容 */
export interface ConfigItem {
    /**
     * 配置键（点路径）。属性级声明可省略——自动取
     * `"${addonName}.${propertyKey}"`；类级声明必须显式提供。
     */
    key?: string;
    /** 值类型（读取时按此转换） */
    type: ConfigValueType;
    /** 默认值：环境变量与存储层均未提供时生效 */
    default?: unknown;
    /** 说明文字（统一管理界面/调试展示用） */
    description?: string;
}

/** `@Config` 写入类的配置声明 */
export interface ConfigDefinition extends ConfigItem {
    /** 承载配置的类属性名；类级声明为空字符串 */
    propertyKey: string;
}

/**
 * 声明配置项，归属本 Addon 命名空间（owner 自动绑定，无需写自己的名字）。
 *
 * - **类级**：一次声明若干项，必须显式给 `key`
 *   ```ts
 *   @Config({ key: "session.ttl", type: "number", default: 3600 })
 *   @Addon("session")
 *   class SessionAddon {}
 *   ```
 * - **属性级**：key 省略时自动拼接 `"${addonName}.${属性名}"`，
 *   框架在 config 阶段解析出最终值并注入该属性，`onLoad` 中直接 `this.x` 读取
 *   ```ts
 *   @Addon()
 *   class FooAddon {
 *     @Config({ type: "number", default: 10 }) limit!: number;
 *   }
 *   ```
 */
export function Config(
    item: ConfigItem | ConfigItem[],
): ClassDecorator & PropertyDecorator {
    return ((target: any, propertyKey?: string | symbol) => {
        const clazz = classOf(target);
        for (const one of Array.isArray(item) ? item : [item]) {
            pushMeta<ConfigDefinition>(CONFIG_KEY, clazz, {
                ...one,
                propertyKey:
                    propertyKey === undefined ? "" : String(propertyKey),
            });
        }
    }) as ClassDecorator & PropertyDecorator;
}

/** 读取类上的全部 `@Config` 声明（属性级在前，类级在后） */
export function listConfigs(clazz: any): ConfigDefinition[] {
    return ownMeta<ConfigDefinition>(CONFIG_KEY, clazz);
}
