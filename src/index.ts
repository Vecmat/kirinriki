import "reflect-metadata";

// Core
export { Kirinriki, createApp } from "./core/app";

export { Container, container, BeanScope, BeanType } from "./core/container";
export { Exception, createException } from "./core/exception";
export { Router } from "./core/router";

// 元数据键与全局类型（自定义注解注册使用）
export {
    CONTROLLER_KEY,
    ROUTER_KEY,
    TAGGED_PARAM,
    PARAM_VALIDATOR_KEY,
    VALIDATE_SCHEMA_KEY,
    ASPECT_KEY,
    CATCH_KEY,
    AUTOWIRED_KEY
} from "./core/define";
export type { TParams, TAspectExec, TAroundExec, TAspectLike } from "./core/define";

// Decorators - Component
export { Component, Service, Controller, Action, Middleware, Autowired, Inject } from "./decorators/component";

// Decorators - Route
export { InjectRouter, Get, Post, Put, Delete, Patch, Options, Head, All, HttpMethod } from "./decorators/route";
export type { RouterOption } from "./decorators/route";

// Decorators - Params
export { InjectParams, ParamsQuery, ParamsPath, ParamsBody, ParamsHeader, Ctx } from "./decorators/param";
export type { ParamDefinition } from "./decorators/param";

// Decorators - AOP
export { InjectAspect, Before, After, Around, AopType } from "./decorators/aop";
export type { AspectDefinition } from "./decorators/aop";

// Decorators - Exception
export { Catched, Exception as ExceptionDecorator } from "./decorators/exception";

// Decorators - Validation
export { Valid, Validated, validateWithSchema } from "./decorators/validation";
