import {
    Controller,
    Get,
    OnOpen,
    OnMessage,
    OnClose,
    OnError,
} from "@vecmat/kirinriki";
import type { WSContext, WSMessageReceive } from "@vecmat/kirinriki";

// 注：Node 的 @types/node 将 MessageEvent 声明为非泛型，Deno/DOM 为泛型（带默认值），
// 此处使用裸 MessageEvent 以兼容两套类型；event.data 运行时即 WSMessageReceive。

/**
 * WebSocket 示例控制器。
 *
 * 演示 socket.io 风格的消息分发：
 * - `@OnMessage("chat")` / `@OnMessage("join")` 按消息类型分发
 * - `@OnMessage()` 无参兜底，接收全部未匹配消息
 *
 * 客户端发送 JSON 信封：`{"event":"chat","data":"hello"}`
 *
 * 握手：`const ws = new WebSocket("ws://localhost:3000/ws")`
 */
@Controller("/ws")
export class WSController {
    /** 客户端建立连接 */
    @OnOpen()
    async handleConnect(ws: WSContext) {
        console.log("[ws] 客户端已连接");
        ws.send("欢迎连接 WebSocket 服务！");
    }

    /** 按消息类型分发：chat */
    @OnMessage("chat")
    async handleChat(data: string, ws: WSContext) {
        console.log(`[ws] chat: ${data}`);
        ws.send(`Chat: ${data}`);
    }

    /** 按消息类型分发：join */
    @OnMessage("join")
    async handleJoin(data: { room: string }, ws: WSContext) {
        console.log(`[ws] join: ${data}`);
        ws.send(`Joined room: ${data}`);
    }

    /** 兜底：未匹配具体类型的消息走这里 */
    @OnMessage()
    async handleAll(event: MessageEvent, ws: WSContext) {
        const message = String(event.data as WSMessageReceive);
        console.log(`[ws] fallback: ${message}`);
        ws.send(`Fallback: ${message}`);
    }

    /** 客户端断开连接 */
    @OnClose()
    async handleClose(event: CloseEvent) {
        console.log(`[ws] 客户端已断开连接: code=${event.code}`);
    }

    /** 连接异常 */
    @OnError()
    async handleError(event: Event) {
        console.error("[ws] WebSocket 异常:", event);
    }

    /** 同一 Controller 内的普通 HTTP 接口：GET /ws/status */
    @Get("/status")
    async getStatus() {
        return { status: "ok", websocket: "active" };
    }
}
