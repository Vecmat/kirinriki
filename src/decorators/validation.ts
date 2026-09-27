import type { z } from 'zod';
import { container } from '../core/container';
import { PARAM_VALIDATOR_KEY, VALIDATE_SCHEMA_KEY } from '../core/define';
import { Exception } from '../core/exception';

export interface ValidatorDefinition {
    index: number;
    validator: (value: any) => boolean;
    message: string;
}

export interface SchemaDefinition {
    schema: z.ZodTypeAny;
}

/**
 * 参数级轻量校验：注册校验器到容器 PARAM_VALIDATOR_KEY
 * `@ParamsHeader("x-token") @Valid((v) => !!v, { message: "Token missing" })`
 */
export function Valid(
    validator: (value: any) => boolean,
    options?: { message?: string },
): ParameterDecorator {
    return (
        target: any,
        propertyKey: string | symbol | undefined,
        parameterIndex: number,
    ) => {
        container.attachPropertyData(
            PARAM_VALIDATOR_KEY,
            {
                index: parameterIndex,
                validator,
                message: options?.message || 'Validation failed',
            } as ValidatorDefinition,
            target,
            propertyKey === undefined ? '' : String(propertyKey),
        );
    };
}

/**
 * 方法级 DTO Schema 校验：注册 zod Schema 到容器 VALIDATE_SCHEMA_KEY
 * 运行时对 body/DTO 参数执行自动校验
 * `@Validated(UserSchema)`
 */
export function Validated(schema: z.ZodTypeAny): MethodDecorator {
    return (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) => {
        container.attachPropertyData(
            VALIDATE_SCHEMA_KEY,
            { schema } as SchemaDefinition,
            target,
            propertyKey,
        );
        return descriptor;
    };
}

/** 执行 zod 校验，失败抛出 VALIDATION_ERROR */
export function validateWithSchema(schema: z.ZodTypeAny, data: any): any {
    const result = schema.safeParse(data);
    if (!result.success) {
        const message = result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
        throw new Exception('VALIDATION_ERROR', message, 400);
    }
    return result.data;
}
