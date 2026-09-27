/**
 * Kirinriki —— 基于 Hono 的企业级 TypeScript Web 框架。
 *
 * 提供 IOC 容器与依赖注入、声明式路由、参数提取与校验、AOP 切面、
 * 全局异常处理等能力。框架只导出标准 Web `fetch` 处理器，
 * 可运行于 Node.js、Deno、Bun 与 Cloudflare Workers 等环境。
 *
 * @example
 * ```ts
 * import { Kirinriki, Controller, Get } from "@vecmat/kirinriki";
 *
 * @Controller("/")
 * class HelloController {
 *   @Get("/")
 *   hello() { return "Hello Kirinriki"; }
 * }
 *
 * const app = new Kirinriki();
 * await app.init();
 * // Node/Bun: serve({ fetch: app.fetch }); Deno: Deno.serve(app.fetch)
 * ```
 *
 * @module
 */

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
