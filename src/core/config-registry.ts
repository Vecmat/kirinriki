/**
 * 配置项注册表：存储所有子应用/插件声明的配置项 schema。
 *
 * 每个配置项携带 owner（归属的应用/插件命名空间），实现应用间隔离：
 * 应用只能通过 `Config.scope(ownName)` 访问自己的配置项；
 * 未指定 owner 的配置项为主应用全局配置，所有命名空间可读。
 *
 * 与 IOC 容器解耦（模块加载时即可注册，无需等 Config Bean 实例化）。
 */

/** 配置值类型 */
export type ConfigValueType = "string" | "number" | "boolean" | "json";

/** 配置项声明（子应用/插件通过 @App({ config }) 或 registerConfig 提供） */
export interface ConfigField {
    /** 配置键（点路径，如 "auth.tokenTTL"、"server.port"） */
    key: string;
    /** 值类型，读取时按此转换 */
    type: ConfigValueType;
    /** 默认值：环境变量与存储层均未提供时生效 */
    default?: unknown;
    /** 说明文字（统一管理界面/调试展示用） */
    description?: string;
}

/** 注册表内部结构：声明 + 归属命名空间 */
export interface RegisteredConfigField extends ConfigField {
    /** 归属的应用/插件名；undefined 表示主应用全局配置（所有命名空间可读） */
    owner?: string;
}

/**
 * 配置项注册表（全局单例）。
 * 子应用通过 `@App({ config })`、插件通过 `registerConfig(fields, owner)`
 * 声明配置项；主应用通过 Config 统一读取与修改。
 */
export class ConfigRegistry {
    private static instance: ConfigRegistry;
    private schemas = new Map<string, RegisteredConfigField>();

    /** 获取注册表全局单例 */
    static getInstance(): ConfigRegistry {
        if (!ConfigRegistry.instance) {
            ConfigRegistry.instance = new ConfigRegistry();
        }
        return ConfigRegistry.instance;
    }

    /**
     * 注册一个或多个配置项（同 key 后注册覆盖先注册）。
     * @param fields 配置项声明
     * @param owner 归属命名空间（应用名/插件名），缺省为主应用全局
     */
    register(fields: ConfigField | ConfigField[], owner?: string): void {
        for (const field of Array.isArray(fields) ? fields : [fields]) {
            this.schemas.set(field.key, { ...field, owner });
        }
    }

    /** 按 key 获取配置项声明（含归属信息） */
    get(key: string): RegisteredConfigField | undefined {
        return this.schemas.get(key);
    }

    /** 获取配置项归属命名空间；未注册或全局配置返回 undefined */
    ownerOf(key: string): string | undefined {
        return this.schemas.get(key)?.owner;
    }

    /** 获取全部已注册配置项 */
    list(): RegisteredConfigField[] {
        return Array.from(this.schemas.values());
    }

    /** 判断配置项是否已注册 */
    has(key: string): boolean {
        return this.schemas.has(key);
    }
}

/** 框架默认使用的配置项注册表全局单例 */
export const configRegistry: ConfigRegistry = ConfigRegistry.getInstance();

/**
 * 注册配置项的便捷入口（等价 configRegistry.register）。
 * 子应用/插件在模块加载时调用即可声明自己的配置参数：
 * ```ts
 * registerConfig([
 *   { key: "auth.tokenTTL", type: "number", default: 3600, description: "token 过期秒数" },
 * ], "auth");
 * ```
 */
export function registerConfig(
    fields: ConfigField | ConfigField[],
    owner?: string,
): void {
    configRegistry.register(fields, owner);
}
