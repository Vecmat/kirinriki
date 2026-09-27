import "reflect-metadata";
import { container } from "../core/container";
import { TAGGED_PARAM, type TParams } from "../core/define";

/** 基础类型不会作为 DTO 处理 */
const PRIMITIVE_TYPES = [
    "String",
    "Number",
    "Boolean",
    "Object",
    "Array",
    "Function",
    "Symbol",
    "BigInt",
    "Date",
    "Promise",
    "RegExp",
    "Error",
];

/** 参数注入选项 */
export interface ParamOption {
    /** 参数来源标记（query/path/body/header/ctx），供 Schema 校验定位使用 */
    source?: string;
}

/** 参数注入元数据定义 */
export interface ParamDefinition {
    /** 所属方法名 */
    name: string;
    /** 参数提取函数（闭包携带装饰器入参） */
    fn: TParams;
    /** 参数索引 */
    index: number;
    /** 参数类型标识 */
    type: string;
    /** 是否为 DTO 类参数 */
    isDto: boolean;
    /** DTO 类引用（isDto 时存在） */
    dtoClass?: any;
    /** 参数来源标记（query/path/body/header/ctx） */
    source?: string;
}

/**
 * 参数注入：将参数提取函数注册到容器 TAGGED_PARAM
 * 自定义参数注解只需调用 InjectParams(name, fn) 即可全局注册使用
 *
 * @param {string} name 装饰器名称（用于错误提示）
 * @param {TParams} fn 参数提取函数，入参为 Hono Context
 * @param {ParamOption} [opts={}]
 * @returns {*}  {ParameterDecorator}
 */
export const InjectParams = (
    _name: string,
    fn: TParams,
    opts: ParamOption = {},
): ParameterDecorator => {
    return (
        target: any,
        propertyKey: string | symbol | undefined,
        parameterIndex: number,
    ) => {
        const pk = propertyKey === undefined ? "" : String(propertyKey);
        const paramTypes =
            Reflect.getMetadata(
                "design:paramtypes",
                target,
                propertyKey as any,
            ) || [];
        const ptype = paramTypes[parameterIndex];

        let typeName = ptype?.name ?? "object";
        let dtoClass: any;
        let isDto = false;
        // 非 基础 类型视为 DTO 类
        if (ptype && !PRIMITIVE_TYPES.includes(typeName)) {
            typeName = container.getIdentifier(ptype);
            dtoClass = ptype;
            isDto = true;
        }

        container.attachPropertyData(
            TAGGED_PARAM,
            {
                name: pk,
                fn,
                index: parameterIndex,
                type: typeName,
                isDto,
                dtoClass,
                source: opts.source,
            } as ParamDefinition,
            target,
            pk,
        );
    };
};

/** 注入 Hono Context（请求上下文）本身 */
export const Ctx: () => ParameterDecorator = () =>
    InjectParams("Ctx", (ctx: any) => ctx, { source: "ctx" });

/**
 * 注入 URL query 参数。
 * @param name 参数名；省略时注入整个 query 对象
 */
export const ParamsQuery: (name?: string) => ParameterDecorator = (name) =>
    InjectParams(
        "ParamsQuery",
        async (ctx: any) => (name ? ctx.req.query(name) : ctx.req.query()),
        {
            source: "query",
        },
    );

/**
 * 注入路径参数（如 `/user/:id` 中的 `id`）。
 * @param name 参数名；省略时注入全部路径参数
 */
export const ParamsPath: (name?: string) => ParameterDecorator = (name) =>
    InjectParams(
        "ParamsPath",
        async (ctx: any) => (name ? ctx.req.param(name) : ctx.req.param()),
        { source: "path" },
    );

/**
 * 注入请求体（JSON）。
 * @param name 字段名；省略时注入整个 body 对象
 */
export const ParamsBody: (name?: string) => ParameterDecorator = (name) =>
    InjectParams(
        "ParamsBody",
        async (ctx: any) => {
            const body = await ctx.req.json().catch(() => ({}));
            return name ? body?.[name] : body;
        },
        { source: "body" },
    );

/**
 * 注入请求头。
 * @param name 头名称；省略时注入全部请求头
 */
export const ParamsHeader: (name?: string) => ParameterDecorator = (name) =>
    InjectParams(
        "ParamsHeader",
        async (ctx: any) => (name ? ctx.req.header(name) : ctx.req.header()),
        {
            source: "header",
        },
    );
