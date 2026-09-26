import "reflect-metadata";

export enum AopType {
    BEFORE = "before",
    AFTER = "after",
    AROUND = "around"
}

export interface AopDefinition {
    type: AopType;
    aspectId: string;
    methodName: string;
    controller: any;
}

export function Before(aspectId: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const aops: AopDefinition[] = Reflect.getMetadata("aop:definitions", target.constructor) || [];
        aops.push({
            type: AopType.BEFORE,
            aspectId,
            methodName: propertyKey as string,
            controller: target.constructor
        });
        Reflect.defineMetadata("aop:definitions", aops, target.constructor);
    };
}

export function After(aspectId: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const aops: AopDefinition[] = Reflect.getMetadata("aop:definitions", target.constructor) || [];
        aops.push({
            type: AopType.AFTER,
            aspectId,
            methodName: propertyKey as string,
            controller: target.constructor
        });
        Reflect.defineMetadata("aop:definitions", aops, target.constructor);
    };
}

export function Around(aspectId: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const aops: AopDefinition[] = Reflect.getMetadata("aop:definitions", target.constructor) || [];
        aops.push({
            type: AopType.AROUND,
            aspectId,
            methodName: propertyKey as string,
            controller: target.constructor
        });
        Reflect.defineMetadata("aop:definitions", aops, target.constructor);
    };
}
