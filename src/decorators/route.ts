import "reflect-metadata";

export enum HttpMethod {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH",
    OPTIONS = "OPTIONS",
    HEAD = "HEAD",
    ALL = "ALL"
}

export interface RouteDefinition {
    method: HttpMethod;
    path: string;
    methodName: string;
    controller: any;
}

function createRouteDecorator(method: HttpMethod) {
    return function (path?: string): MethodDecorator {
        return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
            const routes: RouteDefinition[] = Reflect.getMetadata("controller:routes", target.constructor) || [];
            routes.push({
                method,
                path: path || "",
                methodName: propertyKey as string,
                controller: target.constructor
            });
            Reflect.defineMetadata("controller:routes", routes, target.constructor);
        };
    };
}

export const Get = createRouteDecorator(HttpMethod.GET);
export const Post = createRouteDecorator(HttpMethod.POST);
export const Put = createRouteDecorator(HttpMethod.PUT);
export const Delete = createRouteDecorator(HttpMethod.DELETE);
export const Patch = createRouteDecorator(HttpMethod.PATCH);
export const Options = createRouteDecorator(HttpMethod.OPTIONS);
export const Head = createRouteDecorator(HttpMethod.HEAD);
export const All = createRouteDecorator(HttpMethod.ALL);
