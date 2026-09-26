import { container } from "../core/container";
import { CATCH_KEY } from "../core/define";

export interface CatchDefinition {
    errorKey: string;
}

/**
 * 异常标记：包装方法，将抛出的错误打上 errorKey / errorMessage 标识
 * `@Exception("API_DEMO_ERROR", '用户创建失败')`
 */
export function Exception(errorKey: string, message?: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (err: any) {
                // 保留已有标识（如内层已标记）
                err.errorKey = err.errorKey || errorKey;
                err.errorMessage = err.errorMessage || message || err.message;
                throw err;
            }
        };

        return descriptor;
    };
}

/**
 * 全局异常处理器：捕获到错误后通过 errorKey 匹配对应处理函数（支持 "API_*" 通配）
 * 元数据全局注册到容器 CATCH_KEY，所有控制器的处理器全局生效
 * `@Catched("API_*")`
 */
export function Catched(errorKey: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        container.attachPropertyData(CATCH_KEY, { errorKey } as CatchDefinition, target, propertyKey);
        return descriptor;
    };
}
