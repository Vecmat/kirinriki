import "reflect-metadata";
import {
    InjectWebSocket,
    OnOpen,
    OnMessage,
    OnClose,
    OnError,
    WsEventType,
    type WebSocketOption,
} from "../../src/decorators/websocket";
import { container } from "../../src/core/container";
import { WEBSOCKET_KEY } from "../../src/core/define";
import { resetGlobals } from "../helpers/reset";

function applyMethod(dec: MethodDecorator, target: any, key: string) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key) || {
        value: function () {},
        writable: true,
        configurable: true,
        enumerable: false,
    };
    dec(target, key, descriptor);
}

describe("WebSocket 装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("InjectWebSocket", () => {
        it("写入 WEBSOCKET_KEY：event/method/messageType", () => {
            class Ctrl {
                onConn() {}
            }
            applyMethod(InjectWebSocket(WsEventType.OPEN), Ctrl.prototype, "onConn");
            const metas = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            expect(metas[0].data.event).toBe(WsEventType.OPEN);
            expect(metas[0].data.method).toBe("onConn");
            expect(metas[0].data.messageType).toBeUndefined();
            expect(metas[0].propertyKey).toBe("onConn");
        });

        it("messageType 传入时写入", () => {
            class Ctrl {
                chat() {}
            }
            applyMethod(
                InjectWebSocket(WsEventType.MESSAGE, "chat"),
                Ctrl.prototype,
                "chat",
            );
            const meta = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.messageType).toBe("chat");
            expect(meta.data.event).toBe(WsEventType.MESSAGE);
        });

        it("返回原 descriptor", () => {
            class Ctrl {
                m() {}
            }
            const descriptor: PropertyDescriptor = {
                value: function () {},
                writable: true,
                configurable: true,
                enumerable: false,
            };
            const ret = InjectWebSocket(WsEventType.OPEN)(
                Ctrl.prototype,
                "m",
                descriptor,
            );
            expect(ret).toBe(descriptor);
        });
    });

    describe("事件语法糖", () => {
        it("@OnOpen 注册 OPEN 事件", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(OnOpen(), Ctrl.prototype, "m");
            const meta = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.event).toBe(WsEventType.OPEN);
        });

        it("@OnMessage 无参：messageType 为 undefined（兜底）", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(OnMessage(), Ctrl.prototype, "m");
            const meta = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.event).toBe(WsEventType.MESSAGE);
            expect(meta.data.messageType).toBeUndefined();
        });

        it("@OnMessage('chat')：messageType='chat'", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(OnMessage("chat"), Ctrl.prototype, "m");
            const meta = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.messageType).toBe("chat");
        });

        it("@OnClose 注册 CLOSE 事件", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(OnClose(), Ctrl.prototype, "m");
            const meta = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.event).toBe(WsEventType.CLOSE);
        });

        it("@OnError 注册 ERROR 事件", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(OnError(), Ctrl.prototype, "m");
            const meta = container.listPropertyData<WebSocketOption>(
                WEBSOCKET_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.event).toBe(WsEventType.ERROR);
        });
    });
});
