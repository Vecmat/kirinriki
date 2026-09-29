import type { Hono } from "hono";
import type { UpgradeWebSocket, WSEvents } from "hono/ws";
import { container, BeanType, type PropertyMeta } from "./container";
import {
    ASPECT_KEY,
    CATCH_KEY,
    CONTROLLER_KEY,
    PARAM_VALIDATOR_KEY,
    ROUTER_KEY,
    TAGGED_PARAM,
    VALIDATE_SCHEMA_KEY,
    WEBSOCKET_KEY,
    type TAspectExec,
} from "./define";
import { AopType, type AspectDefinition } from "../decorators/aop";
import { HttpMethod, type RouterOption } from "../decorators/route";
import type { ParamDefinition } from "../decorators/param";
import { WsEventType, type WebSocketOption } from "../decorators/websocket";
import {
    type SchemaDefinition,
    type ValidatorDefinition,
    validateWithSchema,
} from "../decorators/validation";
import { Exception } from "./exception";
import { appRegistry } from "./app-registry";

interface CatchHandler {
    errorKey: string;
    methodName: string;
    instance: any;
}

/** 已注册路由的描述信息，用于打印表格 */
interface RouteInfo {
    method: string;
    path: string;
    app: string;
    handler: string;
}

/**
 * 路由解析器：读取容器中由装饰器全局注册的元数据，
 * 将 Controller 方法挂载为 Hono 路由，并负责参数构建、
 * AOP 切面织入与 `@Catched` 全局异常分发。
 */
export class Router {
    private hono: Hono;
    private globalHandlers: CatchHandler[] = [];
    private printRoutes: boolean;
    /**
     * 运行时提供的 WebSocket 升级函数。
     * 不同运行时来源不同：`hono/deno`、`hono/bun`、`hono/cloudflare-workers`
     * 或 `@hono/node-server`，由应用构造时通过选项注入，框架不绑定具体运行时。
     */
    private upgradeWebSocket: UpgradeWebSocket<any, any> | undefined;
    /** 缺少升级函数时只告警一次，避免日志刷屏 */
    private warnedMissingUpgrade = false;

    /**
     * @param hono 要挂载路由的 Hono 实例
     * @param printRoutes 是否在注册完成后打印路由表格（默认由环境变量 KIRINRIKI_PRINT_ROUTES 控制）
     * @param upgradeWebSocket 运行时提供的 WebSocket 升级函数（可选）
     */
    constructor(
        hono: Hono,
        printRoutes = false,
        upgradeWebSocket?: UpgradeWebSocket<any, any>,
    ) {
        this.hono = hono;
        this.printRoutes = printRoutes;
        this.upgradeWebSocket = upgradeWebSocket;
    }

    /** 遍历容器中的 Controller Bean，读取全局注册的元数据并挂载到 Hono */
    registerRoutes(): void {
        const controllers = container.getByType(BeanType.CONTROLLER);
        const routeList: RouteInfo[] = [];

        // 全局收集 @Catched 异常处理器（精确匹配优先于通配符）
        for (const ctrl of controllers) {
            for (const h of container.listPropertyData<{ errorKey: string }>(
                CATCH_KEY,
                ctrl.constructor,
            )) {
                this.globalHandlers.push({
                    errorKey: h.data.errorKey,
                    methodName: h.propertyKey,
                    instance: ctrl,
                });
            }
        }
        this.globalHandlers.sort((a, b) => {
            const aWild = a.errorKey.endsWith("*") ? 1 : 0;
            const bWild = b.errorKey.endsWith("*") ? 1 : 0;
            return aWild - bWild;
        });

        for (const controller of controllers) {
            const clazz = controller.constructor;
            const [pathMeta] = container.getPropertyData<{ path: string }>(
                CONTROLLER_KEY,
                clazz,
            );
            // 控制器自身路径
            const ctrlPath = pathMeta?.path || "/";
            // 若控制器属于某应用，拼接应用 basePath
            const app = appRegistry.getByController(clazz);
            const basePath = app
                ? this.normalizePath(app.basePath, ctrlPath)
                : ctrlPath;
            const aops = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                clazz,
            );

            for (const routeMeta of container.listPropertyData<RouterOption>(
                ROUTER_KEY,
                clazz,
            )) {
                const route = routeMeta.data;
                const methodName = String(route.method);
                const fullPath = this.normalizePath(basePath, route.path);
                const httpMethod = route.requestMethod.toLowerCase();

                routeList.push({
                    method: route.requestMethod,
                    path: fullPath,
                    app: app?.name || "<Main>",
                    handler: `${clazz.name}.${methodName}`,
                });

                (this.hono as any)[httpMethod](fullPath, async (c: any) => {
                    try {
                        const args = await this.buildArgs(c, clazz, methodName);
                        const result = await this.executeWithAop(
                            controller,
                            methodName,
                            args,
                            aops,
                            c,
                        );
                        return c.json(result);
                    } catch (err: any) {
                        const handled = await this.handleException(err, c);
                        if (handled) return handled;

                        const status = err.status || 500;
                        return c.json(
                            {
                                errorKey: err.errorKey || "INTERNAL_ERROR",
                                message:
                                    err.errorMessage ||
                                    err.message ||
                                    "Internal server error",
                            },
                            status,
                        );
                    }
                });
            }

            // Controller 中声明了任意 @OnOpen/@OnMessage/@OnClose/@OnError 时，
            // 在控制器基础路径上挂载 WebSocket 升级路由（GET）
            this.registerWebSocket(
                controller,
                clazz,
                basePath,
                app?.name,
                routeList,
            );
        }

        if (this.printRoutes) {
            this.printRouteTable(routeList);
        }
    }

    /** 以 ASCII 表格打印已注册路由列表 */
    private printRouteTable(routes: RouteInfo[]): void {
        if (routes.length === 0) {
            console.log("[Kirinriki] No routes registered.");
            return;
        }

        // 计算每列显示宽度（CJK 字符按 2 宽计算）
        const cols = ["Method", "Path", "App", "Handler"];
        const widths = cols.map((c, i) => {
            const max = Math.max(
                c.length,
                ...routes.map((r) => this.displayWidth(Object.values(r)[i])),
            );
            return max;
        });

        const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
        const formatRow = (cells: string[]) =>
            "| " +
            cells
                .map((cell, i) => this.padDisplay(cell, widths[i]))
                .join(" | ") +
            " |";

        console.log("");
        console.log(sep);
        console.log(formatRow(cols));
        console.log(sep);
        for (const r of routes) {
            console.log(formatRow([r.method, r.path, r.app, r.handler]));
        }
        console.log(sep);
        console.log(` Total: ${routes.length} routes`);
        console.log("");
    }

    /** 计算字符串的显示宽度（CJK/全角字符按 2 计算） */
    private displayWidth(str: string): number {
        let w = 0;
        for (const ch of str) {
            const code = ch.codePointAt(0) || 0;
            // CJK 统一汉字、全角字符、日文韩文等按 2 宽
            if (
                (code >= 0x1100 && code <= 0x115f) ||
                (code >= 0x2e80 && code <= 0xa4cf) ||
                (code >= 0xa960 && code <= 0xa97f) ||
                (code >= 0xac00 && code <= 0xd7a3) ||
                (code >= 0xf900 && code <= 0xfaff) ||
                (code >= 0xfe30 && code <= 0xfe4f) ||
                (code >= 0xff00 && code <= 0xff60) ||
                (code >= 0xffe0 && code <= 0xffe6)
            ) {
                w += 2;
            } else {
                w += 1;
            }
        }
        return w;
    }

    /** 按显示宽度右补空格 */
    private padDisplay(str: string, width: number): string {
        const dw = this.displayWidth(str);
        const pad = width - dw;
        return str + " ".repeat(Math.max(pad, 0));
    }

    private normalizePath(base: string, path: string): string {
        const b = base.endsWith("/") ? base.slice(0, -1) : base;
        const p = path.startsWith("/") ? path : `/${path}`;
        return `${b}${p}` || "/";
    }

    /** 去除末尾斜杠用于路径等价比较（"/link/" 与 "/link" 视为同一路径） */
    private trimTrailingSlash(path: string): string {
        return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    }

    /**
     * 注册 Controller 级 WebSocket 端点。
     *
     * 控制器基础路径（含所属应用 basePath）即 WebSocket 握手地址，
     * 如 `@Controller("/link")` 的 WS 端点为 `GET /link`（协议升级），
     * 同控制器内的 `@Get("/status")` 等 HTTP 路由照常挂载，互不影响。
     */
    private registerWebSocket(
        controller: any,
        clazz: any,
        basePath: string,
        appName: string | undefined,
        routeList: RouteInfo[],
    ): void {
        const metas = container.listPropertyData<WebSocketOption>(
            WEBSOCKET_KEY,
            clazz,
        );
        if (metas.length === 0) return;

        routeList.push({
            method: "WS",
            path: basePath,
            app: appName || "<Main>",
            handler: `${clazz.name}.[websocket]`,
        });

        // 与同路径 GET 路由冲突检测：Hono 按注册顺序匹配，HTTP 路由先注册会优先生效
        const conflict = container
            .listPropertyData<RouterOption>(ROUTER_KEY, clazz)
            .some(
                (m) =>
                    m.data.requestMethod === HttpMethod.GET &&
                    this.trimTrailingSlash(
                        this.normalizePath(basePath, m.data.path),
                    ) === this.trimTrailingSlash(basePath),
            );
        if (conflict) {
            console.warn(
                `[Kirinriki] Controller "${clazz.name}" declares WebSocket handlers and a GET route on "${basePath}"; ` +
                    "the HTTP route is registered first and will take precedence.",
            );
        }

        if (!this.upgradeWebSocket) {
            if (!this.warnedMissingUpgrade) {
                this.warnedMissingUpgrade = true;
                console.warn(
                    '[Kirinriki] WebSocket controllers found, but no "upgradeWebSocket" adapter was provided. ' +
                        'Pass it via "new Kirinriki({ websocket: upgradeWebSocket })" from "hono/deno", ' +
                        '"hono/bun", "hono/cloudflare-workers" or "@hono/node-server".',
                );
            }
            // 未注入运行时适配器时给出明确的 501 响应，而非静默 404
            (this.hono as any).get(basePath, (c: any) =>
                c.json(
                    {
                        errorKey: "WEBSOCKET_NOT_CONFIGURED",
                        message:
                            "WebSocket is not configured on the server: missing runtime upgradeWebSocket adapter.",
                    },
                    501,
                ),
            );
            return;
        }

        const events = this.buildWsEvents(controller, clazz.name, metas);
        (this.hono as any).get(
            basePath,
            this.upgradeWebSocket(() => events),
        );
    }

    /**
     * 将 @OnOpen/@OnMessage/@OnClose/@OnError 元数据包装为 Hono WSEvents。
     *
     * `@OnMessage` 支持 socket.io 风格的消息分发：
     * - `@OnMessage("chat")` → 客户端须发送 JSON 信封 `{"event":"chat","data":...}`，
     *   匹配后处理器收到 `(data, ws)`，data 为信封中的 data 字段（任意类型）。
     * - `@OnMessage()` 无参 → 兜底处理器，接收全部消息，签名 `(event: MessageEvent, ws)`。
     *   未被具体 messageType 匹配的消息（含非 JSON）会回落到此。
     *
     * 处理器以控制器实例为 this 调用；异步处理器的拒绝会被捕获并打印，
     * 避免产生 unhandled rejection。
     */
    private buildWsEvents(
        controller: any,
        clazzName: string,
        metas: PropertyMeta<WebSocketOption>[],
    ): WSEvents {
        const eventKey: Record<WsEventType, keyof WSEvents> = {
            [WsEventType.OPEN]: "onOpen",
            [WsEventType.MESSAGE]: "onMessage",
            [WsEventType.CLOSE]: "onClose",
            [WsEventType.ERROR]: "onError",
        };
        const events: WSEvents = {};

        // 消息分发：按 messageType 收集具体处理器 + 最多一个兜底处理器
        const messageHandlers = new Map<string, string>();
        let catchAllMethod = "";

        for (const meta of metas) {
            const { event } = meta.data;
            const methodName = String(meta.data.method ?? meta.propertyKey);

            if (event === WsEventType.MESSAGE) {
                const mt = meta.data.messageType;
                if (mt) {
                    if (messageHandlers.has(mt)) {
                        console.warn(
                            `[Kirinriki] Duplicate @OnMessage("${mt}") in "${clazzName}.${methodName}"; ignoring.`,
                        );
                        continue;
                    }
                    messageHandlers.set(mt, methodName);
                } else {
                    if (catchAllMethod) {
                        console.warn(
                            `[Kirinriki] Duplicate @OnMessage() fallback in "${clazzName}.${methodName}"; ignoring.`,
                        );
                        continue;
                    }
                    catchAllMethod = methodName;
                }
                continue;
            }

            // 非 MESSAGE 事件：保持原有逻辑（去重 + 直接绑定）
            if ((events as any)[eventKey[event]]) {
                console.warn(
                    `[Kirinriki] Duplicate WebSocket handler for "${event}" in "${clazzName}.${methodName}"; ignoring.`,
                );
                continue;
            }

            const invoke = (evt: unknown, ws: unknown): unknown => {
                try {
                    const args =
                        event === WsEventType.OPEN ? [ws, evt] : [evt, ws];
                    const ret = controller[methodName].call(
                        controller,
                        ...args,
                    );
                    if (ret && typeof (ret as any).then === "function") {
                        return (ret as Promise<unknown>).catch((err) => {
                            console.error(
                                `[Kirinriki] WebSocket "${event}" handler "${clazzName}.${methodName}" failed:`,
                                err,
                            );
                        });
                    }
                    return ret;
                } catch (err) {
                    console.error(
                        `[Kirinriki] WebSocket "${event}" handler "${clazzName}.${methodName}" threw:`,
                        err,
                    );
                }
            };

            (events as any)[eventKey[event]] = invoke;
        }

        // 若存在任一 @OnMessage 变体，组装 onMessage 回调
        if (messageHandlers.size > 0 || catchAllMethod) {
            events.onMessage = (evt: any, ws: any) => {
                this.dispatchMessage(
                    controller,
                    clazzName,
                    evt,
                    ws,
                    messageHandlers,
                    catchAllMethod,
                );
            };
        }

        return events;
    }

    /**
     * 消息分发核心：解析 JSON 信封，按 event 字段路由到具体处理器；
     * 未匹配或非 JSON 时回落到兜底处理器。
     */
    private dispatchMessage(
        controller: any,
        clazzName: string,
        evt: any,
        ws: any,
        messageHandlers: Map<string, string>,
        catchAllMethod: string,
    ): void {
        const raw = evt.data;
        let parsed: any = null;
        let matched = false;
        // 尝试 JSON 解析信封 { event, data }
        if (typeof raw === "string") {
            try {
                parsed = JSON.parse(raw);
                if (
                    parsed &&
                    typeof parsed === "object" &&
                    typeof parsed.event === "string"
                ) {
                    const handler = messageHandlers.get(parsed.event);
                    if (handler) {
                        matched = true;
                        this.invokeMessageHandler(
                            controller,
                            clazzName,
                            handler,
                            parsed.event,
                            [parsed.data, ws],
                        );
                    }
                }
            } catch {
                // 非 JSON，走兜底
            }
        }

        // 未匹配具体处理器 → 回落到兜底
        if (!matched && catchAllMethod) {
            this.invokeMessageHandler(
                controller,
                clazzName,
                catchAllMethod,
                "*",
                [evt, ws],
            );
        }
    }

    /** 调用单个消息处理器，捕获同步异常与异步拒绝 */
    private invokeMessageHandler(
        controller: any,
        clazzName: string,
        methodName: string,
        eventLabel: string,
        args: unknown[],
    ): void {
        try {
            const ret = controller[methodName].call(controller, ...args);
            if (ret && typeof (ret as any).then === "function") {
                (ret as Promise<unknown>).catch((err) => {
                    console.error(
                        `[Kirinriki] @OnMessage("${eventLabel}") handler "${clazzName}.${methodName}" failed:`,
                        err,
                    );
                });
            }
        } catch (err) {
            console.error(
                `[Kirinriki] @OnMessage("${eventLabel}") handler "${clazzName}.${methodName}" threw:`,
                err,
            );
        }
    }

    /** 通过 TAGGED_PARAM 注册的提取函数构建方法入参，并执行校验 */
    private async buildArgs(
        c: any,
        clazz: any,
        methodName: string,
    ): Promise<any[]> {
        const params = (
            container.getPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                clazz,
                methodName,
            ) || []
        ).sort((a, b) => a.index - b.index);
        const schema = container.getPropertyData<SchemaDefinition>(
            VALIDATE_SCHEMA_KEY,
            clazz,
            methodName,
        )[0]?.schema;
        const validators =
            container.getPropertyData<ValidatorDefinition>(
                PARAM_VALIDATOR_KEY,
                clazz,
                methodName,
            ) || [];

        // Schema 校验对象：DTO 参数或 body 来源参数
        const schemaParam = params.find((p) => p.isDto || p.source === "body");
        const args: any[] = [];

        for (const p of params) {
            let value = await p.fn(c, p.index);

            if (schema && p === schemaParam) {
                value = validateWithSchema(schema, value);
            } else if (
                p.isDto &&
                typeof p.dtoClass === "function" &&
                p.dtoClass !== Object
            ) {
                // DTO 类：plain 转 class 实例
                value = Object.assign(new p.dtoClass(), value);
            }

            for (const v of validators) {
                if (v.index === p.index && !v.validator(value)) {
                    throw new Exception("VALIDATION_ERROR", v.message, 400);
                }
            }

            args[p.index] = value;
        }

        return args;
    }

    private async executeWithAop(
        controller: any,
        methodName: string,
        args: any[],
        aops: PropertyMeta<AspectDefinition>[],
        ctx: any,
    ): Promise<any> {
        const originalMethod = controller[methodName].bind(controller);
        const next = () => originalMethod(...args);

        // Before
        for (const a of aops.filter(
            (a) =>
                a.propertyKey === methodName && a.data.type === AopType.BEFORE,
        )) {
            await this.invokeAspect(a.data, AopType.BEFORE, ctx, args);
        }

        // Around / 原方法
        const around = aops.find(
            (a) =>
                a.propertyKey === methodName && a.data.type === AopType.AROUND,
        );
        let result: any;
        if (around) {
            result = await this.invokeAround(
                around.data,
                ctx,
                originalMethod,
                args,
            );
        } else {
            result = await next();
        }

        // After
        for (const a of aops.filter(
            (a) =>
                a.propertyKey === methodName && a.data.type === AopType.AFTER,
        )) {
            await this.invokeAspect(a.data, AopType.AFTER, ctx, args, result);
        }

        return result;
    }

    private async invokeAspect(
        aop: AspectDefinition,
        mode: AopType,
        ctx: any,
        args: any[],
        result?: any,
    ): Promise<void> {
        if (typeof aop.exec === "string") {
            // 组件切面：调用组件的 before/after 方法
            const bean: any = container.get(aop.exec);
            if (!bean) {
                console.warn(
                    `[Kirinriki] Aspect component "${aop.exec}" not found in container, did you import it?`,
                );
                return;
            }
            if (mode === AopType.BEFORE) {
                await bean?.before?.(ctx, ...args);
            } else {
                await bean?.after?.(ctx, result, ...args);
            }
        } else {
            // 内联函数切面
            const exec = aop.exec as TAspectExec;
            if (mode === AopType.BEFORE) {
                await exec(ctx, ...args);
            } else {
                await exec(ctx, result, ...args);
            }
        }
    }

    private async invokeAround(
        aop: AspectDefinition,
        ctx: any,
        originalMethod: Function,
        args: any[],
    ): Promise<any> {
        const next = () => originalMethod(...args);
        if (typeof aop.exec === "string") {
            const bean: any = container.get(aop.exec);
            if (bean?.around) {
                return bean.around(ctx, originalMethod, ...args);
            }
            return next();
        }
        // 内联函数切面：exec(ctx, next)
        return aop.exec(ctx, next);
    }

    /**
     * 按 errorKey 匹配全局 @Catched 处理器（支持 "PREFIX_*" 通配）。
     * 处理器返回值语义：
     * - 对象：作为响应体返回，中断链
     * - true：中断链，返回默认错误 JSON
     * - false / undefined：继续匹配下一个处理器
     */
    private async handleException(err: any, c: any): Promise<any> {
        const status = err.status || 500;
        const payload = {
            errorKey: err.errorKey || "INTERNAL_ERROR",
            message: err.errorMessage || err.message || "Internal server error",
        };

        for (const handler of this.globalHandlers) {
            if (!this.matchErrorKey(handler.errorKey, err.errorKey)) continue;

            const result = await handler.instance[handler.methodName].call(
                handler.instance,
                err,
                c,
            );

            if (result instanceof Response) return result;
            if (result === true) return c.json(payload, status);
            if (result !== undefined && result !== false)
                return c.json(result, err.status || 200);
        }
        return null;
    }

    private matchErrorKey(pattern: string, key?: string): boolean {
        if (!key) return false;
        if (pattern === key) return true;
        if (pattern.endsWith("*")) {
            return key.startsWith(pattern.slice(0, -1));
        }
        return false;
    }
}
