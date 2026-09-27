import "reflect-metadata";
import { container, BeanType, BeanScope } from "../core/container";
import {
    AUTOWIRED_KEY,
    CONTROLLER_KEY,
    ROUTER_KEY,
    TAGGED_PARAM,
} from "../core/define";
import { Exception } from "../core/exception";
import { appRegistry } from "../core/app-registry";

/** 类装饰器通用选项 */
export interface ComponentOptions {
    /** 自定义 Bean id，默认取类名 */
    id?: string;
    /** 生命周期作用域，默认单例 */
    scope?: BeanScope;
    /** 加载优先级（数值越大越优先） */
    priority?: number;
}

/** 控制器专属选项 */
export interface ControllerOptions extends ComponentOptions {
    /** 所属应用名（对应 `@App` 的 name）。设置后路由自动拼接应用 basePath */
    app?: string;
}

function registerBean(
    target: any,
    type: BeanType,
    id: string,
    options: ComponentOptions = {},
) {
    // 方法装饰器先于类装饰器执行，此处可可靠拦截：
    // 非 Controller 类上不允许使用路由/参数装饰器
    if (type !== BeanType.CONTROLLER) {
        const misuse =
            container.listPropertyData(ROUTER_KEY, target).length > 0 ||
            container.listPropertyData(TAGGED_PARAM, target).length > 0;
        if (misuse) {
            throw new Exception(
                "BOOTERR_DEPRO_UNSUITED",
                "Route/Param decorators are only used in controllers class.",
            );
        }
    }

    container.register({
        id,
        clazz: target,
        type,
        scope: options.scope || BeanScope.SINGLETON,
        priority: options.priority || 0,
    });
}

/**
 * 通用组件装饰器：将类注册为 {@link BeanType.COMPONENT} Bean。
 * @param options Bean id、作用域等选项
 */
export function Component(options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.COMPONENT, id, options);
    };
}

/**
 * 服务装饰器：将类注册为 {@link BeanType.SERVICE} Bean，用于承载业务逻辑。
 * @param options Bean id、作用域等选项
 */
export function Service(options?: ComponentOptions): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.SERVICE, id, options);
    };
}

/**
 * 控制器装饰器：将类注册为 Controller，并声明该控制器的基础路径。
 * 类中被 `@Get`/`@Post` 等标记的方法会在 `init()` 时挂载到该路径之下。
 *
 * 若指定 `app`，则路由路径会自动拼接所属应用的 basePath，
 * 如 `@Controller("/login", { app: "auth" })` + `@App({ basePath: "/auth" })`
 * 最终路由为 `/auth/login`。
 *
 * @param path 基础路径，默认 `"/"`
 * @param options Bean id、作用域、所属应用等选项
 */
export function Controller(
    path?: string,
    options?: ControllerOptions,
): ClassDecorator {
    return (target: any) => {
        const id = options?.id || target.name;
        registerBean(target, BeanType.CONTROLLER, id, options);
        // 控制器基础路径注册到容器
        container.attachPropertyData(
            CONTROLLER_KEY,
            { path: path || "/" },
            target,
        );
        // 绑定控制器到所属应用
        if (options?.app) {
            appRegistry.bindController(target, options.app);
        }
    };
}

/**
 * 业务动作类装饰器：与 HTTP 请求分离的具体动作，
 * 可被控制器、CLI 命令行或其他工具以相同方式调用。
 *
 * @param id 自定义 Bean id，默认取类名
 * @param options Bean id、作用域等选项
 */
export function Action(
    id?: string,
    options?: ComponentOptions,
): ClassDecorator {
    return (target: any) => {
        const beanId = id || target.name;
        registerBean(target, BeanType.COMPONENT, beanId, options);
    };
}

/**
 * 中间件组件装饰器：将类注册为 {@link BeanType.MIDDLEWARE} Bean。
 * @param options Bean id、作用域等选项
 */
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
        container.attachPropertyData(
            AUTOWIRED_KEY,
            { propertyKey, id: beanId },
            target,
            propertyKey,
        );
    };
}

/**
 * 按 id 注入容器 Bean（{@link Autowired} 的显式字符串形式）。
 * @param id 目标 Bean 的 id
 */
export function Inject(id: string): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        container.attachPropertyData(
            AUTOWIRED_KEY,
            { propertyKey, id },
            target,
            propertyKey,
        );
    };
}
