import "reflect-metadata";

export interface ExceptionDefinition {
    errorKey: string;
    methodName: string;
    controller: any;
}

export function Exception(errorKey: string, message?: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const exceptions: ExceptionDefinition[] =
            Reflect.getMetadata("exception:definitions", target.constructor) || [];
        exceptions.push({
            errorKey,
            methodName: propertyKey as string,
            controller: target.constructor
        });
        Reflect.defineMetadata("exception:definitions", exceptions, target.constructor);

        // Store the original method
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (err: any) {
                err.errorKey = errorKey;
                err.errorMessage = message || err.message;
                throw err;
            }
        };

        return descriptor;
    };
}

export function Catched(errorKey: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const handlers: any[] = Reflect.getMetadata("exception:handlers", target.constructor) || [];
        handlers.push({
            errorKey,
            methodName: propertyKey as string,
            controller: target.constructor
        });
        Reflect.defineMetadata("exception:handlers", handlers, target.constructor);
        return descriptor;
    };
}
