import { Hono } from "hono";
import { container, BeanType, PropertyMeta } from "./container";
import {
    ASPECT_KEY,
    CATCH_KEY,
    CONTROLLER_KEY,
    PARAM_VALIDATOR_KEY,
    ROUTER_KEY,
    TAGGED_PARAM,
    VALIDATE_SCHEMA_KEY,
    TAspectExec
} from "./define";
import { AopType, AspectDefinition } from "../decorators/aop";
import { RouterOption } from "../decorators/route";
import { ParamDefinition } from "../decorators/param";
import { SchemaDefinition, ValidatorDefinition, validateWithSchema } from "../decorators/validation";
import { Exception } from "./exception";

interface CatchHandler {
    errorKey: string;
    methodName: string;
    instance: any;
}

export class Router {
    private hono: Hono;
    private globalHandlers: CatchHandler[] = [];

    constructor(hono: Hono) {
        this.hono = hono;
    }

    /** 遍历容器中的 Controller Bean，读取全局注册的元数据并挂载到 Hono */
    registerRoutes(): void {
        const controllers = container.getByType(BeanType.CONTROLLER);

        // 全局收集 @Catched 异常处理器（精确匹配优先于通配符）
        for (const ctrl of controllers) {
            for (const h of container.listPropertyData<{ errorKey: string }>(CATCH_KEY, ctrl.constructor)) {
                this.globalHandlers.push({
                    errorKey: h.data.errorKey,
                    methodName: h.propertyKey,
                    instance: ctrl
                });
            }
        }
        this.globalHandlers.sort((a, b) => {
            const aWild = a.errorKey.endsWith("*") ? 1 : 0;
            const bWild = b.errorKey.endsWith("*") ? 1 : 0;
            return aWild - bWild;
        });

        for (const controller of controllers) {
            const clazz = controller.constructor;
            const [pathMeta] = container.getPropertyData<{ path: string }>(CONTROLLER_KEY, clazz);
            const basePath = pathMeta?.path || "/";
            const aops = container.listPropertyData<AspectDefinition>(ASPECT_KEY, clazz);

            for (const routeMeta of container.listPropertyData<RouterOption>(ROUTER_KEY, clazz)) {
                const route = routeMeta.data;
                const methodName = String(route.method);
                const fullPath = this.normalizePath(basePath, route.path);
                const httpMethod = route.requestMethod.toLowerCase();

                (this.hono as any)[httpMethod](fullPath, async (c: any) => {
                    try {
                        const args = await this.buildArgs(c, clazz, methodName);
                        const result = await this.executeWithAop(controller, methodName, args, aops, c);
                        return c.json(result);
                    } catch (err: any) {
                        const handled = await this.handleException(err, c);
                        if (handled) return handled;

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

    /** 通过 TAGGED_PARAM 注册的提取函数构建方法入参，并执行校验 */
    private async buildArgs(c: any, clazz: any, methodName: string): Promise<any[]> {
        const params = (container.getPropertyData<ParamDefinition>(TAGGED_PARAM, clazz, methodName) || []).sort(
            (a, b) => a.index - b.index
        );
        const schema = container.getPropertyData<SchemaDefinition>(VALIDATE_SCHEMA_KEY, clazz, methodName)[0]?.schema;
        const validators = container.getPropertyData<ValidatorDefinition>(PARAM_VALIDATOR_KEY, clazz, methodName) || [];

        // Schema 校验对象：DTO 参数或 body 来源参数
        const schemaParam = params.find((p) => p.isDto || p.source === "body");
        const args: any[] = [];

        for (const p of params) {
            let value = await p.fn(c, p.index);

            if (schema && p === schemaParam) {
                value = validateWithSchema(schema, value);
            } else if (p.isDto && typeof p.dtoClass === "function" && p.dtoClass !== Object) {
                // DTO 类：plain 转 class 实例
                value = Object.assign(new p.dtoClass(), value);
            }

            for (const v of validators) {
                if (v.index === p.index && !v.validator(value)) {
                    throw new Exception("VALIDATION_ERROR", v.message, 400);
                }
            }

            args[p.index] = value;
        }

        return args;
    }

    private async executeWithAop(
        controller: any,
        methodName: string,
        args: any[],
        aops: PropertyMeta<AspectDefinition>[],
        ctx: any
    ): Promise<any> {
        const originalMethod = controller[methodName].bind(controller);
        const next = () => originalMethod(...args);

        // Before
        for (const a of aops.filter((a) => a.propertyKey === methodName && a.data.type === AopType.BEFORE)) {
            await this.invokeAspect(a.data, AopType.BEFORE, ctx, args);
        }

        // Around / 原方法
        const around = aops.find((a) => a.propertyKey === methodName && a.data.type === AopType.AROUND);
        let result: any;
        if (around) {
            result = await this.invokeAround(around.data, ctx, originalMethod, args);
        } else {
            result = await next();
        }

        // After
        for (const a of aops.filter((a) => a.propertyKey === methodName && a.data.type === AopType.AFTER)) {
            await this.invokeAspect(a.data, AopType.AFTER, ctx, args, result);
        }

        return result;
    }

    private async invokeAspect(
        aop: AspectDefinition,
        mode: AopType,
        ctx: any,
        args: any[],
        result?: any
    ): Promise<void> {
        if (typeof aop.exec === "string") {
            // 组件切面：调用组件的 before/after 方法
            const bean: any = container.get(aop.exec);
            if (!bean) {
                console.warn(`[Kirinriki] Aspect component "${aop.exec}" not found in container, did you import it?`);
                return;
            }
            if (mode === AopType.BEFORE) {
                await bean?.before?.(ctx, ...args);
            } else {
                await bean?.after?.(ctx, result, ...args);
            }
        } else {
            // 内联函数切面
            const exec = aop.exec as TAspectExec;
            if (mode === AopType.BEFORE) {
                await exec(ctx, ...args);
            } else {
                await exec(ctx, result, ...args);
            }
        }
    }

    private async invokeAround(aop: AspectDefinition, ctx: any, originalMethod: Function, args: any[]): Promise<any> {
        const next = () => originalMethod(...args);
        if (typeof aop.exec === "string") {
            const bean: any = container.get(aop.exec);
            if (bean?.around) {
                return bean.around(ctx, originalMethod, ...args);
            }
            return next();
        }
        // 内联函数切面：exec(ctx, next)
        return aop.exec(ctx, next);
    }

    /**
     * 按 errorKey 匹配全局 @Catched 处理器（支持 "PREFIX_*" 通配）。
     * 处理器返回值语义：
     * - 对象：作为响应体返回，中断链
     * - true：中断链，返回默认错误 JSON
     * - false / undefined：继续匹配下一个处理器
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
