import {
    Controller,
    Get,
    OnOpen,
    OnMessage,
    OnClose,
    OnError,
} from "@vecmat/kirinriki";
import type {
    WSContext,
    WSMessageReceive,
    WsEventType,
} from "@vecmat/kirinriki";

// 注：Node 的 @types/node 将 MessageEvent 声明为非泛型，Deno/DOM 为泛型（带默认值），
// 此处使用裸 MessageEvent 以兼容两套类型；event.data 运行时即 WSMessageReceive。

/**
 * WebSocket 示例控制器。
 *
 * 控制器基础路径 `/link` 即 WebSocket 握手地址（GET /link 协议升级），
 * 同时控制器内仍可保留普通 HTTP 接口（如 GET /link/status）。
 *
 * 握手方式（示例服务默认监听 3000 端口）：
 *   const ws = new WebSocket("ws://localhost:3000/link");
 */
@Controller("/link")
export class LinkController {
    /** 客户端建立连接 */
    @OnOpen()
    async handleConnect(ws: WSContext) {
        console.log("[link] 客户端已连接");
        ws.send("欢迎连接 WebSocket 服务！");
    }

    /** 收到客户端消息：原样回显 */
    @OnMessage()
    async handleMessage(event: MessageEvent, ws: WSContext) {
        const message = String(event.data as WSMessageReceive);
        console.log(`[link] 收到消息: ${message}`);
        ws.send(`Echo: ${message}`);
    }

    /** 客户端断开连接 */
    @OnClose()
    async handleClose(event: CloseEvent) {
        console.log(`[link] 客户端已断开连接: code=${event.code}`);
    }

    /** 连接异常 */
    @OnError()
    async handleError(event: Event) {
        console.error("[link] WebSocket 异常:", event);
    }

    /** 同一 Controller 内的普通 HTTP 接口：GET /link/status */
    @Get("/status")
    async getStatus() {
        return { status: "ok", websocket: "active" };
    }
}
