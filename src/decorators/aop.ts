import { container } from '../core/container';
import { ASPECT_KEY } from '../core/define';
import type { TAspectExec, TAroundExec, TAspectLike } from '../core/define';

export enum AopType {
    BEFORE = 'before',
    AFTER = 'after',
    AROUND = 'around',
}

export interface AspectDefinition {
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

export const Before: (exec: TAspectExec | string) => MethodDecorator = (exec) =>
    InjectAspect(AopType.BEFORE, exec);
export const After: (exec: TAspectExec | string) => MethodDecorator = (exec) =>
    InjectAspect(AopType.AFTER, exec);
export const Around: (exec: TAroundExec | string) => MethodDecorator = (exec) =>
    InjectAspect(AopType.AROUND, exec);
