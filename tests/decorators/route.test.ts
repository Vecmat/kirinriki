import "reflect-metadata";
import {
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
    type RouterOption,
} from "../../src/decorators/route";
import { container } from "../../src/core/container";
import { ROUTER_KEY } from "../../src/core/define";
import { resetGlobals } from "../helpers/reset";

function applyMethodDecorator(
    dec: MethodDecorator,
    target: any,
    key: string,
): void {
    const descriptor = Object.getOwnPropertyDescriptor(target, key) || {
        value: function () {},
        writable: true,
        configurable: true,
        enumerable: false,
    };
    dec(target, key, descriptor);
}

describe("Route 装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("InjectRouter", () => {
        it("默认 path=/、默认 GET、routerName 空串、method=propertyKey", () => {
            class Ctrl {
                m() {}
            }
            applyMethodDecorator(InjectRouter(), Ctrl.prototype, "m");
            const metas = container.listPropertyData<RouterOption>(
                ROUTER_KEY,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            const opt = metas[0].data;
            expect(opt.path).toBe("/");
            expect(opt.requestMethod).toBe(HttpMethod.GET);
            expect(opt.routerName).toBe("");
            expect(opt.method).toBe("m");
        });

        it("自定义 path 与 method", () => {
            class Ctrl {
                m() {}
            }
            applyMethodDecorator(
                InjectRouter("/p", HttpMethod.POST),
                Ctrl.prototype,
                "m",
            );
            const meta = container.listPropertyData<RouterOption>(
                ROUTER_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.path).toBe("/p");
            expect(meta.data.requestMethod).toBe(HttpMethod.POST);
        });

        it("自定义 routerName", () => {
            class Ctrl {
                m() {}
            }
            applyMethodDecorator(
                InjectRouter("/", HttpMethod.GET, { routerName: "alias" }),
                Ctrl.prototype,
                "m",
            );
            const meta = container.listPropertyData<RouterOption>(
                ROUTER_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.routerName).toBe("alias");
        });

        it("返回原 descriptor", () => {
            class Ctrl {
                m() {}
            }
            const descriptor = {
                value: function () {},
                writable: true,
                configurable: true,
                enumerable: false,
            };
            const ret = InjectRouter()(Ctrl.prototype, "m", descriptor);
            expect(ret).toBe(descriptor);
        });
    });

    describe("HTTP 方法语法糖", () => {
        const cases: Array<[string, HttpMethod, (p?: string) => MethodDecorator]> = [
            ["Get", HttpMethod.GET, Get],
            ["Post", HttpMethod.POST, Post],
            ["Put", HttpMethod.PUT, Put],
            ["Delete", HttpMethod.DELETE, Delete],
            ["Patch", HttpMethod.PATCH, Patch],
            ["Options", HttpMethod.OPTIONS, Options],
            ["Head", HttpMethod.HEAD, Head],
            ["All", HttpMethod.ALL, All],
        ];

        for (const [name, expectedMethod, dec] of cases) {
            it(`@${name} 写入对应 requestMethod`, () => {
                class Ctrl {
                    handler() {}
                }
                applyMethodDecorator(dec("/x"), Ctrl.prototype, "handler");
                const meta = container.listPropertyData<RouterOption>(
                    ROUTER_KEY,
                    Ctrl.prototype,
                )[0];
                expect(meta.data.requestMethod).toBe(expectedMethod);
                expect(meta.data.path).toBe("/x");
                expect(meta.data.method).toBe("handler");
            });

            it(`@${name} 默认 path=/`, () => {
                class Ctrl {
                    handler() {}
                }
                applyMethodDecorator(dec(), Ctrl.prototype, "handler");
                const meta = container.listPropertyData<RouterOption>(
                    ROUTER_KEY,
                    Ctrl.prototype,
                )[0];
                expect(meta.data.path).toBe("/");
            });
        }
    });
});
