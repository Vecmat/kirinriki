/**
 * Kirinriki —— 基于 Hono 的企业级 TypeScript Web 框架。
 *
 * 提供 IOC 容器与依赖注入、声明式路由、参数提取与校验、中间件绑定（@Use）、
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
export { Kirinriki } from "./core/app";
export type { KirinrikiOptions } from "./core/app";

export { Container, container, BeanScope, BeanType } from "./core/container";
export { Exception, createException } from "./core/exception";
export { ServiceRegistry } from "./core/services";
export { Router } from "./core/router";
export { AppRegistry, appRegistry } from "./core/app-registry";
export type { AppDefinition } from "./core/app-registry";

// Kernel - 框架级公用服务（所有应用可注入）
export { Logger } from "./kernel/logger";
// 配置服务类导出为 ConfigService：`Config` 已被 @Config 注解占用
export { Config as ConfigService } from "./kernel/config";
export {
    ConfigStore,
    MemoryConfigStore,
    FileConfigStore,
    ScopedConfig,
} from "./kernel/config";
export type {
    ConfigOptions,
    ConfigSource,
    ConfigExplain,
} from "./kernel/config";

// 元数据键与全局类型（自定义注解注册使用）
export {
    CONTROLLER_KEY,
    ROUTER_KEY,
    TAGGED_PARAM,
    PARAM_VALIDATOR_KEY,
    VALIDATE_SCHEMA_KEY,
    CATCH_KEY,
    AUTOWIRED_KEY,
    WEBSOCKET_KEY,
    LIFECYCLE_KEY,
    MIDDLEWARE_KEY,
    LifecycleEvent,
} from "./core/define";
export type { TParams } from "./core/define";

// Lifecycle - 生命周期钩子执行器（插件/高级用法可直接调用）
export { runLifecycle } from "./core/lifecycle";
export type { LifecycleHookFn } from "./core/lifecycle";

// Config Registry - 配置项注册
// 注意：Addon 应使用 `scope.config.register(...)`（owner 自动绑定其命名空间），
// 此处的独立函数主要供**主应用**声明全局（无 owner）配置项使用。
export {
    ConfigRegistry,
    configRegistry,
    registerConfig,
} from "./core/config-registry";
export type { ConfigField, ConfigValueType } from "./core/config-registry";

// Addon - 扩展载体（注解声明的类 + 分阶段生命周期）
export { AddonManager } from "./core/addon";
export type {
    IAddon,
    AddonClass,
    AddonScope,
    AddonMiddlewareModule,
    UseMiddlewareOptions,
} from "./core/addon";

// Decorators - Addon（@Addon）与 Config（@Config）
export { Addon } from "./decorators/addon";
export type {
    AddonOptions,
    AddonMetaOptions,
    AddonMeta,
} from "./decorators/addon";
export { Config } from "./decorators/Config";
export type { ConfigItem, ConfigDefinition } from "./decorators/Config";

// Decorators - Savant（命名中间件：声明侧 @Savant / 引用侧 @Use / 前置后置钩子 @Before @After）
export { Savant, Use, Before, After } from "./decorators/Savant";
export type {
    SavantOptions,
    SavantDefinition,
    UseMiddlewareDefinition,
    AspectHook,
} from "./decorators/Savant";

// Decorators - Component
export {
    Component,
    Service,
    Controller,
    Action,
    Middleware,
    Autowired,
    Inject,
} from "./decorators/component";
export type {
    ComponentOptions,
    ControllerOptions,
} from "./decorators/component";

// Decorators - App
export { App, createAppDecorators } from "./decorators/app";
export type { AppOptions, AppDecorators } from "./decorators/app";

// Decorators - Route
export {
    InjectRouter,
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Options,
    Head,
    All,
    HttpMethod,
} from "./decorators/route";
export type { RouterOption } from "./decorators/route";

// Decorators - WebSocket
export {
    InjectWebSocket,
    OnOpen,
    OnMessage,
    OnClose,
    OnError,
    WsEventType,
} from "./decorators/websocket";
export type { WebSocketOption } from "./decorators/websocket";

// WebSocket 类型（由 hono/ws 透传，便于编写处理器签名）
export type {
    WSContext,
    WSMessageReceive,
    WSEvents,
    UpgradeWebSocket,
} from "hono/ws";

// Decorators - Params
export {
    InjectParams,
    ParamsQuery,
    ParamsPath,
    ParamsBody,
    ParamsHeader,
    Ctx,
} from "./decorators/param";
export type { ParamDefinition, ParamOption } from "./decorators/param";

// Decorators - Exception
export {
    Catched,
    Exception as ExceptionDecorator,
} from "./decorators/exception";

// Decorators - Validation
export { Valid, Validated, validateWithSchema } from "./decorators/validation";

// Decorators - Lifecycle
export { OnInit, OnReady, OnDestroy } from "./decorators/lifecycle";
