import "reflect-metadata";

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

export class Container {
    private static instance: Container;
    private registry = new Map<string, BeanDefinition>();
    private typeRegistry = new Map<BeanType, BeanDefinition[]>();

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

    private createInstance(def: BeanDefinition): any {
        const clazz = def.clazz;
        const instance = new clazz();

        // Auto-wire dependencies
        const injectMeta = Reflect.getMetadata("design:inject", clazz.prototype) || [];
        for (const { propertyKey, id } of injectMeta) {
            instance[propertyKey] = this.get(id);
        }

        return instance;
    }
}

export const container = Container.getInstance();
