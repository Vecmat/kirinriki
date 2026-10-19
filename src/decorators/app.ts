import { appRegistry } from "../core/app-registry";
import { configRegistry, type ConfigField } from "../core/config-registry";
import {
    Component,
    Service,
    Controller,
    Action,
    Middleware,
    Autowired,
    Inject,
    type ControllerOptions,
} from "./component";
import { Get, Post, Put, Delete, Patch, Options, Head, All } from "./route";
import {
    ParamsQuery,
    ParamsPath,
    ParamsBody,
    ParamsHeader,
    Ctx,
} from "./param";
import { Valid, Validated } from "./validation";
import { Use, Before, After } from "./Savant";
import { OnOpen, OnMessage, OnClose, OnError } from "./websocket";

/** `@App` 装饰器选项 */
export interface AppOptions {
    /** 应用唯一名称（如 "auth"、"payment"） */
    name: string;
    /** 路由前缀（如 "/auth"），应用内控制器路径自动拼接此前缀 */
    basePath: string;
    /**
     * 应用级 hash，作为静态资源访问路径前缀 `/{hash}/*`。
     * 需在创建子应用时显式申请获取并固定下来（不自动生成），
     * 前端构建时据此固定引用。
     */
    hash: string;
    /** 静态资源目录。可传相对路径（相对于运行时 cwd）或绝对路径；纯接口应用可省略 */
    staticDir?: string;
    /**
     * 子应用配置项声明（key/类型/默认值），注册到统一配置中心。
     * 配置来源（命令行/环境变量/文件/Redis）与运行时修改由主应用统一管理，
     * 子应用内通过 `Config.get(key)` 读取。
     */
    config?: ConfigField[];
}

/**
 * 子应用声明装饰器。
 *
 * 每个子应用用此装饰器声明其元数据：名称、路由前缀、hash、静态目录。
 * 框架据此为应用内控制器自动拼接 basePath，并把静态资源挂到 `/{hash}/*` 路径。
 *
 * hash 由应用创建时显式提供（申请获取），一旦发布不宜变更，否则前端引用会失效。
 *
 * @example
 * ```ts
 * @App({ name: "auth", basePath: "/auth", hash: "953fa84f", staticDir: "apps/auth/static" })
 * export class AuthApp {}
 * ```
 */
export function App(options: AppOptions): ClassDecorator {
    return (target: any) => {
        appRegistry.register({
            name: options.name,
            basePath: options.basePath,
            staticDir: options.staticDir,
            appDir: "",
            appHash: options.hash,
        });
        if (options.config?.length) {
            // 配置项归属该子应用命名空间，其他应用无法通过 scope() 越权访问
            configRegistry.register(options.config, options.name);
        }
    };
}

/** 应用级装饰器集合类型 */
export interface AppDecorators {
    /** 已绑定完整应用选项的 @App 装饰器，直接使用无需传参 */
    App: () => ClassDecorator;
    Controller: (
        path?: string,
        options?: Omit<ControllerOptions, "app">,
    ) => ClassDecorator;
    Component: typeof Component;
    Service: typeof Service;
    Action: typeof Action;
    Middleware: typeof Middleware;
    Autowired: typeof Autowired;
    Inject: typeof Inject;
    Get: typeof Get;
    Post: typeof Post;
    Put: typeof Put;
    Delete: typeof Delete;
    Patch: typeof Patch;
    Options: typeof Options;
    Head: typeof Head;
    All: typeof All;
    ParamsQuery: typeof ParamsQuery;
    ParamsPath: typeof ParamsPath;
    ParamsBody: typeof ParamsBody;
    ParamsHeader: typeof ParamsHeader;
    Ctx: typeof Ctx;
    Valid: typeof Valid;
    Validated: typeof Validated;
    Use: typeof Use;
    Before: typeof Before;
    After: typeof After;
    OnOpen: typeof OnOpen;
    OnMessage: typeof OnMessage;
    OnClose: typeof OnClose;
    OnError: typeof OnError;
}

/**
 * 应用级装饰器工厂：为指定应用生成一组已绑定 appName 的装饰器。
 *
 * 应用内控制器使用此工厂返回的 `@Controller` 时，无需再传 `{ app: "xxx" }`，
 * 工厂会自动把应用名注入。其他装饰器（路由/参数/校验/中间件绑定）直接透传框架实现。
 *
 * 建议在每个子应用的 `base/decorators.ts` 中调用一次并导出，
 * 应用的全部元数据（name/basePath/hash/staticDir）集中于此一处声明：
 * ```ts
 * // apps/auth/base/decorators.ts
 * import { createAppDecorators } from "@vecmat/kirinriki";
 * export const { App, Controller, Get, Post, ParamsBody, ... } = createAppDecorators({
 *   name: "auth",
 *   basePath: "/auth",
 *   hash: "953fa84f",
 *   staticDir: "apps/auth/static",
 * });
 * ```
 *
 * 应用声明（选项已由工厂绑定，无需传参）：
 * ```ts
 * import { App } from "./base/decorators";
 *
 * @App()
 * export class AuthApp {}
 * ```
 *
 * 应用内控制器：
 * ```ts
 * import { Controller, Post, ParamsBody } from "../base/decorators";
 *
 * @Controller("/")  // 自动绑定 app: "auth"
 * export class AuthController { ... }
 * ```
 *
 * @param options 应用选项（name 同时作为 @Controller 的 app 绑定值）
 * @returns 绑定了该应用的装饰器集合
 */
export function createAppDecorators(options: AppOptions): AppDecorators {
    const appName = options.name;

    /** 绑定了完整应用选项的 App：无参使用 */
    const BoundApp = (): ClassDecorator => App(options);

    /** 绑定了 appName 的 Controller：自动注入 app 选项 */
    const AppController = (
        path?: string,
        options?: Omit<ControllerOptions, "app">,
    ): ClassDecorator => Controller(path, { ...options, app: appName });

    return {
        /** 已绑定应用选项的应用声明装饰器，无参使用 */
        App: BoundApp,
        /** 已绑定应用的控制器装饰器，无需传 app */
        Controller: AppController,
        // Bean / 依赖注入装饰器（直接透传，无需 app 信息）
        Component,
        Service,
        Action,
        Middleware,
        Autowired,
        Inject,
        // 路由装饰器（直接透传，无需 app 信息）
        Get,
        Post,
        Put,
        Delete,
        Patch,
        Options,
        Head,
        All,
        // 参数装饰器
        ParamsQuery,
        ParamsPath,
        ParamsBody,
        ParamsHeader,
        Ctx,
        // 校验装饰器
        Valid,
        Validated,
        // 中间件绑定装饰器（@Use：命名/带参/内联三种引用形式）
        Use,
        // 前置/后置便捷钩子（@Use 内联形式的切片写法）
        Before,
        After,
        // WebSocket 装饰器
        OnOpen,
        OnMessage,
        OnClose,
        OnError,
    };
}
