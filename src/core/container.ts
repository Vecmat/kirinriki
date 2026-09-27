import "reflect-metadata";
import { AUTOWIRED_KEY } from "./define";

/** Bean 的生命周期作用域 */
export enum BeanScope {
    /** 单例：整个应用共享一个实例（默认） */
    SINGLETON = "singleton",
    /** 原型：每次获取都创建新实例 */
    PROTOTYPE = "prototype",
    /** 请求级：预留给请求作用域使用 */
    REQUEST = "request",
}

/** Bean 的组件类型 */
export enum BeanType {
    /** 控制器：承载 HTTP 路由 */
    CONTROLLER = "controller",
    /** 服务：业务逻辑层 */
    SERVICE = "service",
    /** 通用组件（含 Action、切面等） */
    COMPONENT = "component",
    /** 中间件组件 */
    MIDDLEWARE = "middleware",
}

/** Bean 注册定义 */
export interface BeanDefinition {
    /** 容器内唯一标识（默认取类名） */
    id: string;
    /** Bean 对应的类构造器 */
    clazz: any;
    /** 组件类型 */
    type: BeanType;
    /** 生命周期作用域 */
    scope: BeanScope;
    /** 单例缓存实例 */
    instance?: any;
    /** 加载优先级（数值越大越优先） */
    priority?: number;
    /** 依赖的其他 Bean id 列表 */
    dependsOn?: string[];
}

/** 容器全局元数据条目：任意装饰器都可通过 attachPropertyData 注册 */
export interface PropertyMeta<T = any> {
    /** 所属类名 */
    className: string;
    /** 所属方法/属性名，类级别为空字符串 */
    propertyKey: string;
    /** 装饰器注册的元数据载荷 */
    data: T;
}

/**
 * 轻量级 IOC 容器（单例）。
 *
 * 承担两项职责：
 * 1. Bean 注册与解析（含 `@Autowired` 属性依赖装配）；
 * 2. 全局装饰器元数据中心——所有装饰器通过
 *    {@link Container.attachPropertyData} 注册元数据，路由解析期统一读取。
 */
export class Container {
    private static instance: Container;
    private registry = new Map<string, BeanDefinition>();
    private typeRegistry = new Map<BeanType, BeanDefinition[]>();
    private propertyStore = new Map<string, PropertyMeta[]>();

    /** 获取容器全局单例 */
    static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    /** 重置容器（主要用于测试隔离） */
    static reset(): void {
        Container.instance = new Container();
    }

    /** 注册一个 Bean 定义 */
    register(def: BeanDefinition): void {
        this.registry.set(def.id, def);
        if (!this.typeRegistry.has(def.type)) {
            this.typeRegistry.set(def.type, []);
        }
        this.typeRegistry.get(def.type)!.push(def);
    }

    /**
     * 按 id 获取 Bean 实例。
     * 单例首次获取时创建并缓存，原型每次创建新实例；
     * 实例化时自动装配 `@Autowired`/`@Inject` 声明的依赖。
     * @returns Bean 实例；id 不存在时返回 undefined
     */
    get<T = any>(id: string): T | undefined {
        const def = this.registry.get(id);
        if (!def) return undefined;

        if (def.scope === BeanScope.SINGLETON) {
            if (!def.instance) {
                def.instance = this.createInstance(def);
            }
            return def.instance;
        }

        return this.createInstance(def);
    }

    /** 获取某一类型的全部 Bean 实例（如全部控制器） */
    getByType<T = any>(type: BeanType): T[] {
        const defs = this.typeRegistry.get(type) || [];
        return defs.map((d) => this.get(d.id)).filter(Boolean) as T[];
    }

    /** 判断指定 id 的 Bean 是否已注册 */
    has(id: string): boolean {
        return this.registry.has(id);
    }

    /** 获取全部 Bean 定义 */
    getDefinitions(): BeanDefinition[] {
        return Array.from(this.registry.values());
    }

    /**
     * 全局注册元数据
     * 装饰器将路由、参数、切面等定义统一挂到容器，便于运行时查询与扩展自定义注解
     * @param key 元数据键（如 ROUTER_KEY / TAGGED_PARAM / ASPECT_KEY）
     * @param data 元数据
     * @param target 类或类原型
     * @param propertyKey 方法/属性名，类级别可省略
     */
    attachPropertyData<T = any>(
        key: string,
        data: T,
        target: any,
        propertyKey?: string | symbol,
    ): void {
        const className = this.classIdOf(target);
        if (!className) return;
        if (!this.propertyStore.has(key)) {
            this.propertyStore.set(key, []);
        }
        this.propertyStore.get(key)!.push({
            className,
            propertyKey: propertyKey === undefined ? "" : String(propertyKey),
            data,
        });
    }

    /** 读取指定类指定方法（或类级别）的元数据 */
    getPropertyData<T = any>(
        key: string,
        target: any,
        propertyKey?: string | symbol,
    ): T[] {
        const className = this.classIdOf(target);
        const pk = propertyKey === undefined ? "" : String(propertyKey);
        return (this.propertyStore.get(key) || [])
            .filter((m) => m.className === className && m.propertyKey === pk)
            .map((m) => m.data as T);
    }

    /** 列出指定类所有方法的元数据（含 propertyKey） */
    listPropertyData<T = any>(key: string, target: any): PropertyMeta<T>[] {
        const className = this.classIdOf(target);
        return (this.propertyStore.get(key) || []).filter(
            (m) => m.className === className,
        ) as PropertyMeta<T>[];
    }

    /** 获取类标识（类名） */
    getIdentifier(target: any): string {
        return this.classIdOf(target);
    }

    private classIdOf(target: any): string {
        if (!target) return "";
        return typeof target === "function"
            ? target.name
            : (target.constructor?.name ?? "");
    }

    private createInstance(def: BeanDefinition): any {
        const instance = new def.clazz();
        // 从容器读取 @Autowired / @Inject 注册的依赖并装配
        for (const meta of this.listPropertyData<{
            propertyKey: string | symbol;
            id: string;
        }>(AUTOWIRED_KEY, def.clazz)) {
            instance[meta.data.propertyKey] = this.get(meta.data.id);
        }
        return instance;
    }
}

/** 框架默认使用的容器全局单例实例 */
export const container: Container = Container.getInstance();
