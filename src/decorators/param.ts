import "reflect-metadata";

export enum ParamSource {
    QUERY = "query",
    PATH = "path",
    BODY = "body",
    HEADER = "header",
    CTX = "ctx"
}

export interface ParamDefinition {
    index: number;
    source: ParamSource;
    name?: string;
    type?: any;
    validate?: any;
}

function createParamDecorator(source: ParamSource) {
    return function (name?: string) {
        return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
            const params: ParamDefinition[] = Reflect.getMetadata("method:params", target, propertyKey) || [];
            const paramType = Reflect.getMetadata("design:paramtypes", target, propertyKey)?.[parameterIndex];
            params.push({
                index: parameterIndex,
                source,
                name,
                type: paramType
            });
            // sort by index to ensure correct order
            params.sort((a, b) => a.index - b.index);
            Reflect.defineMetadata("method:params", params, target, propertyKey);
        };
    };
}

export const ParamsQuery = (name?: string) => createParamDecorator(ParamSource.QUERY)(name);
export const ParamsPath = (name?: string) => createParamDecorator(ParamSource.PATH)(name);
export const ParamsBody = (name?: string) => createParamDecorator(ParamSource.BODY)(name);
export const ParamsHeader = (name?: string) => createParamDecorator(ParamSource.HEADER)(name);
export const Ctx = () => createParamDecorator(ParamSource.CTX)();
