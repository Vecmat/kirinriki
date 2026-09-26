import "reflect-metadata";
import { AUTOWIRED_KEY } from "./define";

export enum BeanScope {
    SINGLETON = "singleton",
    PROTOTYPE = "prototype",
    REQUEST = "request"
}

export enum BeanType {
    CONTROLLER = "controller",
    SERVICE = "service",
    COMPONENT = "component",
    MIDDLEWARE = "middleware"
}

export interface BeanDefinition {
    id: string;
    clazz: any;
    type: BeanType;
    scope: BeanScope;
    instance?: any;
    priority?: number;
    dependsOn?: string[];
}

/** 容器全局元数据条目：任意装饰器都可通过 attachPropertyData 注册 */
export interface PropertyMeta<T = any> {
    className: string;
    propertyKey: string;
    data: T;
}

export class Container {
    private static instance: Container;
    private registry = new Map<string, BeanDefinition>();
    private typeRegistry = new Map<BeanType, BeanDefinition[]>();
    private propertyStore = new Map<string, PropertyMeta[]>();

    static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    static reset(): void {
        Container.instance = new Container();
    }

    register(def: BeanDefinition): void {
        this.registry.set(def.id, def);
        if (!this.typeRegistry.has(def.type)) {
            this.typeRegistry.set(def.type, []);
        }
        this.typeRegistry.get(def.type)!.push(def);
    }

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

    getByType<T = any>(type: BeanType): T[] {
        const defs = this.typeRegistry.get(type) || [];
        return defs.map((d) => this.get(d.id)).filter(Boolean) as T[];
    }

    has(id: string): boolean {
        return this.registry.has(id);
    }

    getDefinitions(): BeanDefinition[] {
        return Array.from(this.registry.values());
    }

    /**
     * 全局注册元数据（参考 koatty IOCContainer.attachPropertyData）
     * 装饰器将路由、参数、切面等定义统一挂到容器，便于运行时查询与扩展自定义注解
     * @param key 元数据键（如 ROUTER_KEY / TAGGED_PARAM / ASPECT_KEY）
     * @param data 元数据
     * @param target 类或类原型
     * @param propertyKey 方法/属性名，类级别可省略
     */
    attachPropertyData<T = any>(key: string, data: T, target: any, propertyKey?: string | symbol): void {
        const className = this.classIdOf(target);
        if (!className) return;
        if (!this.propertyStore.has(key)) {
            this.propertyStore.set(key, []);
        }
        this.propertyStore.get(key)!.push({
            className,
            propertyKey: propertyKey === undefined ? "" : String(propertyKey),
            data
        });
    }

    /** 读取指定类指定方法（或类级别）的元数据 */
    getPropertyData<T = any>(key: string, target: any, propertyKey?: string | symbol): T[] {
        const className = this.classIdOf(target);
        const pk = propertyKey === undefined ? "" : String(propertyKey);
        return (this.propertyStore.get(key) || [])
            .filter((m) => m.className === className && m.propertyKey === pk)
            .map((m) => m.data as T);
    }

    /** 列出指定类所有方法的元数据（含 propertyKey） */
    listPropertyData<T = any>(key: string, target: any): PropertyMeta<T>[] {
        const className = this.classIdOf(target);
        return (this.propertyStore.get(key) || []).filter((m) => m.className === className) as PropertyMeta<T>[];
    }

    /** 获取类标识（类名） */
    getIdentifier(target: any): string {
        return this.classIdOf(target);
    }

    private classIdOf(target: any): string {
        if (!target) return "";
        return typeof target === "function" ? target.name : (target.constructor?.name ?? "");
    }

    private createInstance(def: BeanDefinition): any {
        const instance = new def.clazz();
        // 从容器读取 @Autowired / @Inject 注册的依赖并装配
        for (const meta of this.listPropertyData<{ propertyKey: string | symbol; id: string }>(
            AUTOWIRED_KEY,
            def.clazz
        )) {
            instance[meta.data.propertyKey] = this.get(meta.data.id);
        }
        return instance;
    }
}

export const container = Container.getInstance();
