import "reflect-metadata";
import { container, BeanType, BeanScope } from "../core/container";
import { AUTOWIRED_KEY, CONTROLLER_KEY, ROUTER_KEY, TAGGED_PARAM } from "../core/define";
import { Exception } from "../core/exception";

export interface ComponentOptions {
    id?: string;
    scope?: BeanScope;
    priority?: number;
}

function registerBean(target: any, type: BeanType, id: string, options: ComponentOptions = {}) {
    // 方法装饰器先于类装饰器执行，此处可可靠拦截：
    // 非 Controller 类上不允许使用路由/参数装饰器
    if (type !== BeanType.CONTROLLER) {
        const misuse =
            container.listPropertyData(ROUTER_KEY, target).length > 0 ||
            container.listPropertyData(TAGGED_PARAM, target).length > 0;
        if (misuse) {
            throw new Exception("BOOTERR_DEPRO_UNSUITED", "Route/Param decorators are only used in controllers class.");
        }
    }

    container.register({
        id,
        clazz: target,
        type,
        scope: options.scope || BeanScope.SINGLETON,
        priority: options.priority || 0
    });
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
        // 控制器基础路径注册到容器
        container.attachPropertyData(CONTROLLER_KEY, { path: path || "/" }, target);
    };
}

/** 业务动作类：与 HTTP 请求分离，可被 CLI 等工具复用 */
export function Action(id?: string, options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const beanId = id || target.name;
        registerBean(target, BeanType.COMPONENT, beanId, options);
    };
}

export function Middleware(options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.MIDDLEWARE, id, options);
    };
}

/**
 * 属性注入：依赖定义注册到容器，由容器在实例化时装配。
 * @param id Bean id 字符串或依赖类本身。
 *            建议显式传类（如 @Autowired(UserService)）：
 *            Deno 等运行时不支持 emitDecoratorMetadata，无法从 design:type 推断
 */
export function Autowired(id?: string | Function): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const type = Reflect.getMetadata("design:type", target, propertyKey);
    const beanId = typeof id === "function" ? id.name : id || type?.name;
    container.attachPropertyData(AUTOWIRED_KEY, { propertyKey, id: beanId }, target, propertyKey);
  };
}

export function Inject(id: string): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        container.attachPropertyData(AUTOWIRED_KEY, { propertyKey, id }, target, propertyKey);
    };
}
