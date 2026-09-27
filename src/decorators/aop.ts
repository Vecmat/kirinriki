import { container } from "../core/container";
import { ASPECT_KEY } from "../core/define";
import type { TAspectExec, TAroundExec, TAspectLike } from "../core/define";

/** 切面类型：前置、后置、环绕 */
export enum AopType {
    /** 方法执行前调用：exec(ctx, ...methodArgs) */
    BEFORE = "before",
    /** 方法执行后调用：exec(ctx, result, ...methodArgs) */
    AFTER = "after",
    /** 环绕调用：exec(ctx, next)，由 next() 决定是否/何时执行原方法 */
    AROUND = "around",
}

/** 切面元数据定义 */
export interface AspectDefinition {
    /** 切面类型 */
    type: AopType;
    /** 内联执行函数，或容器中的组件 id（如 "LogAspect"） */
    exec: TAspectLike;
}

/**
 * 切面注入：将切面执行函数（或组件 id）注册到容器 ASPECT_KEY
 * 自定义切面注解只需调用 InjectAspect(type, exec) 即可全局注册使用
 *
 * 执行约定：
 * - Before: exec(ctx, ...methodArgs)
 * - After:  exec(ctx, result, ...methodArgs)
 * - Around: exec(ctx, next)  // next() 执行原方法
 * - exec 为字符串时，从容器解析组件并调用其 before/after/around 方法
 *
 * @param {AopType} type 切面类型
 * @param {TAspectLike} exec 执行函数或组件 id
 * @returns {*}  {MethodDecorator}
 */
export const InjectAspect = (
    type: AopType,
    exec: TAspectLike,
): MethodDecorator => {
    return (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) => {
        container.attachPropertyData(
            ASPECT_KEY,
            { type, exec } as AspectDefinition,
            target,
            propertyKey,
        );
        return descriptor;
    };
};

/**
 * 前置切面装饰器：方法执行前调用。
 * @param exec 内联函数 `(ctx, ...args) => void`，或容器组件 id（调用其 `before` 方法）
 */
export const Before: (exec: TAspectExec | string) => MethodDecorator = (exec) =>
    InjectAspect(AopType.BEFORE, exec);
/**
 * 后置切面装饰器：方法正常返回后调用。
 * @param exec 内联函数 `(ctx, result, ...args) => void`，或容器组件 id（调用其 `after` 方法）
 */
export const After: (exec: TAspectExec | string) => MethodDecorator = (exec) =>
    InjectAspect(AopType.AFTER, exec);
/**
 * 环绕切面装饰器：通过 `next()` 控制原方法执行。
 * @param exec 内联函数 `(ctx, next) => any`，或容器组件 id（调用其 `around` 方法）
 */
export const Around: (exec: TAroundExec | string) => MethodDecorator = (exec) =>
    InjectAspect(AopType.AROUND, exec);
