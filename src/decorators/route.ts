import { container } from "../core/container";
import { ROUTER_KEY } from "../core/define";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",
  OPTIONS = "OPTIONS",
  HEAD = "HEAD",
  ALL = "ALL",
}

export interface RouterOption {
  path: string;
  requestMethod: HttpMethod;
  routerName: string;
  method: string | symbol;
}

/**
 * 路由注入：将方法注册为指定 HTTP 方法与路径的路由（参考 koatty InjectRouter）
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
  routerOptions: { routerName?: string } = {}
): MethodDecorator => {
  const routerName = routerOptions.routerName ?? "";
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    container.attachPropertyData(
      ROUTER_KEY,
      {
        path,
        requestMethod: reqMethod,
        routerName,
        method: propertyKey,
      } as RouterOption,
      target,
      propertyKey
    );
    return descriptor;
  };
};

const createRouteDecorator = (method: HttpMethod) => (path?: string): MethodDecorator =>
  InjectRouter(path ?? "/", method);

export const Get = createRouteDecorator(HttpMethod.GET);
export const Post = createRouteDecorator(HttpMethod.POST);
export const Put = createRouteDecorator(HttpMethod.PUT);
export const Delete = createRouteDecorator(HttpMethod.DELETE);
export const Patch = createRouteDecorator(HttpMethod.PATCH);
export const Options = createRouteDecorator(HttpMethod.OPTIONS);
export const Head = createRouteDecorator(HttpMethod.HEAD);
export const All = createRouteDecorator(HttpMethod.ALL);
