/**
 * 应用注册表：管理所有子应用的元数据（名称、路由前缀、静态目录、应用 hash）。
 *
 * 每个应用通过 {@link App | `@App`} 装饰器注册到此表，
 * 路由解析器据此为控制器自动拼接 basePath，
 * 静态服务据此把 `/{appHash}/*` 映射到应用的 static 目录。
 */

/** 应用元数据定义 */
export interface AppDefinition {
    /** 应用唯一名称（如 "auth"、"payment"） */
    name: string;
    /** 路由前缀（如 "/auth"），应用内控制器路径自动拼接此前缀 */
    basePath: string;
    /** 静态资源目录（相对应用声明文件所在目录）；纯接口应用可省略 */
    staticDir?: string;
    /** 应用声明文件的绝对目录路径，用于解析 staticDir */
    appDir: string;
    /** 基于应用名稳定生成的 8 位 hash，用于静态资源访问路径 */
    appHash: string;
}

/** 基于应用名生成稳定的 8 位 hash（前端构建时可固定引用） */
export function generateAppHash(name: string): string {
    // 简易 FNV-1a hash，避免引入 crypto 依赖（跨运行时通用）
    let hash = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) {
        hash ^= name.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    // 转为 8 位十六进制，保证稳定且 URL 友好
    return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

/**
 * 应用注册表（全局单例）。
 * 存储所有已注册的子应用定义，支持按 name 或控制器类查找。
 */
export class AppRegistry {
    private static instance: AppRegistry;
    private apps = new Map<string, AppDefinition>();
    /** 控制器类 → 应用名 的映射 */
    private controllerAppMap = new Map<Function, string>();

    /** 获取注册表全局单例 */
    static getInstance(): AppRegistry {
        if (!AppRegistry.instance) {
            AppRegistry.instance = new AppRegistry();
        }
        return AppRegistry.instance;
    }

    /** 注册一个应用 */
    register(def: AppDefinition): void {
        this.apps.set(def.name, def);
    }

    /** 绑定控制器到所属应用 */
    bindController(controllerClazz: Function, appName: string): void {
        this.controllerAppMap.set(controllerClazz, appName);
    }

    /** 按应用名获取定义 */
    get(name: string): AppDefinition | undefined {
        return this.apps.get(name);
    }

    /** 获取控制器所属应用定义 */
    getByController(controllerClazz: Function): AppDefinition | undefined {
        const appName = this.controllerAppMap.get(controllerClazz);
        return appName ? this.apps.get(appName) : undefined;
    }

    /** 获取全部已注册应用 */
    list(): AppDefinition[] {
        return Array.from(this.apps.values());
    }

    /** 判断应用是否已注册 */
    has(name: string): boolean {
        return this.apps.has(name);
    }
}

/** 框架默认使用的应用注册表全局单例 */
export const appRegistry: AppRegistry = AppRegistry.getInstance();
