import { container } from "../core/container";
import { ROUTER_KEY } from "../core/define";

/** HTTP 请求方法枚举 */
export enum HttpMethod {
    /** HTTP GET */
    GET = "GET",
    /** HTTP POST */
    POST = "POST",
    /** HTTP PUT */
    PUT = "PUT",
    /** HTTP DELETE */
    DELETE = "DELETE",
    /** HTTP PATCH */
    PATCH = "PATCH",
    /** HTTP OPTIONS */
    OPTIONS = "OPTIONS",
    /** HTTP HEAD */
    HEAD = "HEAD",
    /** 匹配全部 HTTP 方法 */
    ALL = "ALL",
}

/** 路由元数据定义 */
export interface RouterOption {
    /** 方法级路径（与 Controller 基础路径拼接） */
    path: string;
    /** HTTP 方法 */
    requestMethod: HttpMethod;
    /** 路由别名 */
    routerName: string;
    /** 控制器方法名 */
    method: string | symbol;
}

/**
 * 路由注入：将方法注册为指定 HTTP 方法与路径的路由
 * 元数据全局注册到容器 ROUTER_KEY，@Get/@Post 等均为其语法糖
 *
 * @param {string} [path="/"]
 * @param {HttpMethod} [reqMethod=HttpMethod.GET]
 * @param {{ routerName?: string }} [routerOptions={}]
 * @returns {*}  {MethodDecorator}
 */
export const InjectRouter = (
    path = "/",
    reqMethod: HttpMethod = HttpMethod.GET,
    routerOptions: { routerName?: string } = {},
): MethodDecorator => {
    const routerName = routerOptions.routerName ?? "";
    return (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) => {
        container.attachPropertyData(
            ROUTER_KEY,
            {
                path,
                requestMethod: reqMethod,
                routerName,
                method: propertyKey,
            } as RouterOption,
            target,
            propertyKey,
        );
        return descriptor;
    };
};

const createRouteDecorator =
    (method: HttpMethod): ((path?: string) => MethodDecorator) =>
    (path?: string) =>
        InjectRouter(path ?? "/", method);

/** 注册 GET 路由，路径默认 `"/"` */
export const Get: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.GET,
);
/** 注册 POST 路由，路径默认 `"/"` */
export const Post: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.POST,
);
/** 注册 PUT 路由，路径默认 `"/"` */
export const Put: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.PUT,
);
/** 注册 DELETE 路由，路径默认 `"/"` */
export const Delete: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.DELETE,
);
/** 注册 PATCH 路由，路径默认 `"/"` */
export const Patch: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.PATCH,
);
/** 注册 OPTIONS 路由，路径默认 `"/"` */
export const Options: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.OPTIONS,
);
/** 注册 HEAD 路由，路径默认 `"/"` */
export const Head: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.HEAD,
);
/** 注册匹配全部 HTTP 方法的路由，路径默认 `"/"` */
export const All: (path?: string) => MethodDecorator = createRouteDecorator(
    HttpMethod.ALL,
);
