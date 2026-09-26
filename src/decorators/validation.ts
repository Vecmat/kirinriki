import "reflect-metadata";
import { z } from "zod";
import { Exception } from "../core/exception";

export function Valid(validator: (value: any) => boolean, options?: { message?: string }): ParameterDecorator {
    return (target: any, propertyKey: string | symbol, parameterIndex: number) => {
        const validators: any[] = Reflect.getMetadata("method:validators", target, propertyKey) || [];
        validators.push({
            index: parameterIndex,
            validator,
            message: options?.message || "Validation failed"
        });
        Reflect.defineMetadata("method:validators", validators, target, propertyKey);
    };
}

export function Validated(schema: z.ZodType): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const schemas: any[] = Reflect.getMetadata("method:schemas", target.constructor) || [];
        schemas.push({
            methodName: propertyKey as string,
            schema
        });
        Reflect.defineMetadata("method:schemas", schemas, target.constructor);
        return descriptor;
    };
}

export function validateWithSchema(schema: z.ZodType, data: any): any {
    const result = schema.safeParse(data);
    if (!result.success) {
        const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Exception("VALIDATION_ERROR", message, 400);
    }
    return result.data;
}
