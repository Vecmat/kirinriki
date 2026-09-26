import "reflect-metadata";
import { container, BeanType, BeanScope } from "../core/container";

export interface ComponentOptions {
    id?: string;
    scope?: BeanScope;
    priority?: number;
}

function registerBean(target: any, type: BeanType, id: string, options: ComponentOptions = {}) {
    const def = {
        id,
        clazz: target,
        type,
        scope: options.scope || BeanScope.SINGLETON,
        priority: options.priority || 0
    };
    container.register(def);
    Reflect.defineMetadata("bean:type", type, target);
    Reflect.defineMetadata("bean:id", id, target);
}

export function Component(options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.COMPONENT, id, options);
    };
}

export function Service(options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.SERVICE, id, options);
    };
}

export function Controller(path?: string, options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.CONTROLLER, id, options);
        Reflect.defineMetadata("controller:path", path || "/", target);
    };
}

export function Action(id?: string, options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const beanId = id || target.name;
        registerBean(target, BeanType.COMPONENT, beanId, options);
        Reflect.defineMetadata("action:id", beanId, target);
    };
}

export function Middleware(options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.MIDDLEWARE, id, options);
    };
}

export function Autowired(id?: string): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const injectMeta = Reflect.getMetadata("design:inject", target) || [];
        const type = Reflect.getMetadata("design:type", target, propertyKey);
        injectMeta.push({
            propertyKey,
            id: id || type?.name
        });
        Reflect.defineMetadata("design:inject", injectMeta, target);
    };
}

export function Inject(id: string): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const injectMeta = Reflect.getMetadata("design:inject", target) || [];
        injectMeta.push({ propertyKey, id });
        Reflect.defineMetadata("design:inject", injectMeta, target);
    };
}
