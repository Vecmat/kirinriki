import { Hono } from "hono";
import { container, BeanType } from "./container";
import { ParamSource } from "../decorators/param";
import { Exception } from "./exception";
import { validateWithSchema } from "../decorators/validation";

export class Router {
    private hono: Hono;
    private globalHandlers: Array<{ errorKey: string; methodName: string; instance: any }> = [];

    constructor(hono: Hono) {
        this.hono = hono;
    }

    registerRoutes(): void {
        const controllers = container.getByType(BeanType.CONTROLLER);

        // Collect @Catched handlers globally from all controllers.
        // Exact matches run before wildcard matches.
        for (const ctrl of controllers) {
            const handlers = Reflect.getMetadata("exception:handlers", ctrl.constructor) || [];
            for (const h of handlers) {
                this.globalHandlers.push({ errorKey: h.errorKey, methodName: h.methodName, instance: ctrl });
            }
        }
        this.globalHandlers.sort((a, b) => {
            const aWild = a.errorKey.endsWith("*") ? 1 : 0;
            const bWild = b.errorKey.endsWith("*") ? 1 : 0;
            return aWild - bWild;
        });

        for (const controller of controllers) {
            const controllerPath = Reflect.getMetadata("controller:path", controller.constructor) || "/";
            const routes = Reflect.getMetadata("controller:routes", controller.constructor) || [];
            const aops = Reflect.getMetadata("aop:definitions", controller.constructor) || [];

            for (const route of routes) {
                const fullPath = this.normalizePath(controllerPath, route.path);
                const method = route.method.toLowerCase();

                this.hono[method](fullPath, async (c: any) => {
                    try {
                        // Build args from params
                        const args = await this.buildArgs(c, controller, route.methodName);

                        // Execute AOP
                        const result = await this.executeWithAop(controller, route.methodName, args, aops, c);

                        return c.json(result);
                    } catch (err: any) {
                        // Handle exceptions via global @Catched handlers
                        const handled = await this.handleException(err, c);
                        if (handled) return handled;

                        // Default error response
                        const status = err.status || 500;
                        return c.json(
                            {
                                errorKey: err.errorKey || "INTERNAL_ERROR",
                                message: err.errorMessage || err.message || "Internal server error"
                            },
                            status
                        );
                    }
                });
            }
        }
    }

    private normalizePath(base: string, path: string): string {
        const b = base.endsWith("/") ? base.slice(0, -1) : base;
        const p = path.startsWith("/") ? path : `/${path}`;
        return `${b}${p}` || "/";
    }

    private async buildArgs(c: any, controller: any, methodName: string): Promise<any[]> {
        const params = Reflect.getMetadata("method:params", controller, methodName) || [];
        const args: any[] = [];

        // Apply @Validated schema if exists
        const schemas = Reflect.getMetadata("method:schemas", controller.constructor) || [];
        const schemaDef = schemas.find((s: any) => s.methodName === methodName);

        for (const param of params) {
            let value: any;

            switch (param.source) {
                case ParamSource.QUERY:
                    value = param.name ? c.req.query(param.name) : c.req.query();
                    break;
                case ParamSource.PATH:
                    value = param.name ? c.req.param(param.name) : c.req.param();
                    break;
                case ParamSource.BODY:
                    value = await c.req.json().catch(() => ({}));
                    if (schemaDef && !param.name) {
                        // validate the whole body against schema
                        value = validateWithSchema(schemaDef.schema, value);
                    } else if (param.name) {
                        value = value?.[param.name];
                    }
                    break;
                case ParamSource.HEADER:
                    value = param.name ? c.req.header(param.name) : c.req.header();
                    break;
                case ParamSource.CTX:
                    value = c;
                    break;
                default:
                    value = undefined;
            }

            // Run param validators
            const validators = Reflect.getMetadata("method:validators", controller, methodName) || [];
            for (const v of validators) {
                if (v.index === param.index && !v.validator(value)) {
                    throw new Exception("VALIDATION_ERROR", v.message, 400);
                }
            }

            args[param.index] = value;
        }

        return args;
    }

    private async executeWithAop(
        controller: any,
        methodName: string,
        args: any[],
        aops: any[],
        ctx: any
    ): Promise<any> {
        const originalMethod = controller[methodName].bind(controller);

        // Before AOP
        for (const aop of aops.filter((a: any) => a.type === "before" && a.methodName === methodName)) {
            const aspect = container.get(aop.aspectId);
            if (aspect?.before) {
                await aspect.before(ctx, ...args);
            }
        }

        // Around AOP
        const aroundAop = aops.find((a: any) => a.type === "around" && a.methodName === methodName);
        let result: any;
        if (aroundAop) {
            const aspect = container.get(aroundAop.aspectId);
            if (aspect?.around) {
                result = await aspect.around(ctx, originalMethod, ...args);
            } else {
                result = await originalMethod(...args);
            }
        } else {
            result = await originalMethod(...args);
        }

        // After AOP
        for (const aop of aops.filter((a: any) => a.type === "after" && a.methodName === methodName)) {
            const aspect = container.get(aop.aspectId);
            if (aspect?.after) {
                await aspect.after(ctx, result, ...args);
            }
        }

        return result;
    }

    /**
     * Run matching @Catched handlers by errorKey (supports "PREFIX_*" wildcard).
     *
     * Handler return value semantics (per koatty convention):
     * - Response: use it directly as the HTTP response, stop the chain
     * - true:     stop the chain, fall through to default error JSON
     * - other non-boolean value: send it as JSON body, stop the chain
     * - false / undefined: continue to the next matching handler
     */
    private async handleException(err: any, c: any): Promise<any> {
        const status = err.status || 500;
        const payload = {
            errorKey: err.errorKey || "INTERNAL_ERROR",
            message: err.errorMessage || err.message || "Internal server error"
        };

        for (const handler of this.globalHandlers) {
            if (!this.matchErrorKey(handler.errorKey, err.errorKey)) continue;

            const result = await handler.instance[handler.methodName].call(handler.instance, err, c);

            if (result instanceof Response) return result;
            if (result === true) return c.json(payload, status);
            if (result !== undefined && result !== false) return c.json(result, err.status || 200);
            // false / undefined → continue to next handler
        }
        return null;
    }

    private matchErrorKey(pattern: string, key?: string): boolean {
        if (!key) return false;
        if (pattern === key) return true;
        if (pattern.endsWith("*")) {
            return key.startsWith(pattern.slice(0, -1));
        }
        return false;
    }
}
