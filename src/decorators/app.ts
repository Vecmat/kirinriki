import { appRegistry, generateAppHash } from "../core/app-registry";
import { Controller, type ControllerOptions } from "./component";
import { Get, Post, Put, Delete, Patch, Options, Head, All } from "./route";
import {
    ParamsQuery,
    ParamsPath,
    ParamsBody,
    ParamsHeader,
    Ctx,
} from "./param";
import { Valid, Validated } from "./validation";
import { Before, After, Around } from "./aop";
import { OnOpen, OnMessage, OnClose, OnError } from "./websocket";

/** `@App` 装饰器选项 */
export interface AppOptions {
    /** 应用唯一名称（如 "auth"、"payment"） */
    name: string;
    /** 路由前缀（如 "/auth"），应用内控制器路径自动拼接此前缀 */
    basePath: string;
    /** 静态资源目录。可传相对路径（相对于运行时 cwd）或绝对路径；纯接口应用可省略 */
    staticDir?: string;
}

/**
 * 子应用声明装饰器。
 *
 * 每个子应用用此装饰器声明其元数据：名称、路由前缀、静态目录。
 * 框架据此为应用内控制器自动拼接 basePath，并把静态资源挂到 `/{appHash}/*` 路径。
 *
 * appHash 基于应用名稳定生成（8 位十六进制），前端构建时可固定引用。
 *
 * @example
 * ```ts
 * @App({ name: "auth", basePath: "/auth", staticDir: "apps/auth/static" })
 * export class AuthApp {}
 * ```
 */
export function App(options: AppOptions): ClassDecorator {
    return (target: any) => {
        const appHash = generateAppHash(options.name);
        appRegistry.register({
            name: options.name,
            basePath: options.basePath,
            staticDir: options.staticDir,
            appDir: "",
            appHash,
        });
    };
}

/** 应用级装饰器集合类型 */
export interface AppDecorators {
    Controller: (
        path?: string,
        options?: Omit<ControllerOptions, "app">,
    ) => ClassDecorator;
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
    Before: typeof Before;
    After: typeof After;
    Around: typeof Around;
    OnOpen: typeof OnOpen;
    OnMessage: typeof OnMessage;
    OnClose: typeof OnClose;
    OnError: typeof OnError;
}

/**
 * 应用级装饰器工厂：为指定应用生成一组已绑定 appName 的装饰器。
 *
 * 应用内控制器使用此工厂返回的 `@Controller` 时，无需再传 `{ app: "xxx" }`，
 * 工厂会自动把应用名注入。其他装饰器（路由/参数/校验/AOP）直接透传框架实现。
 *
 * 建议在每个子应用的 `base/decorators.ts` 中调用一次并导出：
 * ```ts
 * // apps/auth/base/decorators.ts
 * import { createAppDecorators } from "@vecmat/kirinriki";
 * export const { Controller, Get, Post, ParamsBody, ... } = createAppDecorators("auth");
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
 * @param appName 应用名（必须与 `@App` 的 name 一致）
 * @returns 绑定了该应用的装饰器集合
 */
export function createAppDecorators(appName: string): AppDecorators {
    /** 绑定了 appName 的 Controller：自动注入 app 选项 */
    const AppController = (
        path?: string,
        options?: Omit<ControllerOptions, "app">,
    ): ClassDecorator => Controller(path, { ...options, app: appName });

    return {
        /** 已绑定应用的控制器装饰器，无需传 app */
        Controller: AppController,
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
        // AOP 装饰器
        Before,
        After,
        Around,
        // WebSocket 装饰器
        OnOpen,
        OnMessage,
        OnClose,
        OnError,
    };
}
