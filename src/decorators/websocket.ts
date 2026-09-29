import { container } from "../core/container";
import { WEBSOCKET_KEY } from "../core/define";

/** WebSocket 生命周期事件类型 */
export enum WsEventType {
    /** 连接建立（Cloudflare Workers 不支持） */
    OPEN = "open",
    /** 收到客户端消息 */
    MESSAGE = "message",
    /** 连接关闭 */
    CLOSE = "close",
    /** 连接异常 */
    ERROR = "error",
}

/** WebSocket 事件处理器元数据 */
export interface WebSocketOption {
    /** 事件类型 */
    event: WsEventType;
    /** 控制器方法名 */
    method: string | symbol;
    /** @OnMessage 专属：消息类型名，用于按 event 字段分发；未设置时为兜底处理器 */
    messageType?: string;
}

/**
 * WebSocket 事件注入：将 Controller 方法注册为指定的 WebSocket 事件处理器。
 *
 * 被标记的 Controller 会在其基础路径（含所属应用 basePath）上挂载一个
 * GET 升级路由，处理器方法签名如下：
 *
 * - `@OnOpen()`  → `(ws: WSContext, event?: Event)`（打开事件无业务载荷，ws 在前）
 * - `@OnMessage()` → `(event: MessageEvent, ws: WSContext)`（兜底，接收全部消息）
 * - `@OnMessage("chat")` → `(data: any, ws: WSContext)`（仅接收 event 字段匹配的消息）
 * - `@OnClose()` → `(event: CloseEvent, ws: WSContext)`
 * - `@OnError()` → `(event: Event, ws: WSContext)`
 *
 * 参数均可按需省略，同一事件最多声明一个处理器。
 * 运行时所需的 `upgradeWebSocket` 由 Kirinriki 构造选项 `websocket` 注入。
 *
 * **消息分发协议**：`@OnMessage("chat")` 要求客户端发送 JSON 信封：
 * ```json
 * { "event": "chat", "data": "可以是字符串/对象/任意值" }
 * ```
 * 框架按 `event` 字段匹配后，将 `data` 原样传给处理器。未匹配或非 JSON
 * 的消息会回落到无参的 `@OnMessage()` 兜底处理器（若存在）。
 *
 * @example
 * ```ts
 * @Controller("/link")
 * export class LinkController {
 *   @OnOpen()
 *   async handleConnect(ws: WSContext) {
 *     ws.send("欢迎连接 WebSocket 服务！");
 *   }
 *
 *   // 按消息类型分发（socket.io 风格）
 *   @OnMessage("chat")
 *   async handleChat(data: string, ws: WSContext) {
 *     ws.send(`Chat: ${data}`);
 *   }
 *
 *   @OnMessage("join")
 *   async handleJoin(data: { room: string }, ws: WSContext) {
 *     ws.send(`Joined ${data.room}`);
 *   }
 *
 *   // 兜底：未匹配的消息走这里
 *   @OnMessage()
 *   async handleAll(event: MessageEvent, ws: WSContext) {
 *     ws.send(`Unknown: ${event.data}`);
 *   }
 *
 *   @Get("/status")
 *   getStatus() {
 *     return { status: "ok" };
 *   }
 * }
 * ```
 *
 * @param event 生命周期事件类型
 * @param messageType 仅 @OnMessage 使用：消息类型名，用于按 event 字段分发
 * @returns 方法装饰器
 */
export const InjectWebSocket =
    (event: WsEventType, messageType?: string): MethodDecorator =>
    (
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) => {
        container.attachPropertyData(
            WEBSOCKET_KEY,
            {
                event,
                method: propertyKey,
                messageType,
            } as WebSocketOption,
            target,
            propertyKey,
        );
        return descriptor;
    };

/** 注册 WebSocket 连接建立处理器 */
export const OnOpen: () => MethodDecorator = () =>
    InjectWebSocket(WsEventType.OPEN);
/**
 * 注册 WebSocket 消息接收处理器。
 *
 * - `@OnMessage()` 无参 → 兜底处理器，接收全部消息，签名 `(event: MessageEvent, ws: WSContext)`
 * - `@OnMessage("chat")` → 仅接收 `{"event":"chat","data":...}` 信封匹配的消息，签名 `(data, ws: WSContext)`
 */
export const OnMessage: (messageType?: string) => MethodDecorator = (
    messageType?: string,
) => InjectWebSocket(WsEventType.MESSAGE, messageType);
/** 注册 WebSocket 连接关闭处理器 */
export const OnClose: () => MethodDecorator = () =>
    InjectWebSocket(WsEventType.CLOSE);
/** 注册 WebSocket 异常处理器 */
export const OnError: () => MethodDecorator = () =>
    InjectWebSocket(WsEventType.ERROR);
