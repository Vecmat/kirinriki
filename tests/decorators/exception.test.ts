import "reflect-metadata";
import {
    Exception as ExceptionDecorator,
    Catched,
    type CatchDefinition,
} from "../../src/decorators/exception";
import { container } from "../../src/core/container";
import { CATCH_KEY } from "../../src/core/define";
import { resetGlobals } from "../helpers/reset";

function applyMethod(dec: MethodDecorator, target: any, key: string) {
    const original = (target as any)[key];
    const descriptor: PropertyDescriptor = {
        value: typeof original === "function" ? original : function () {},
        writable: true,
        configurable: true,
        enumerable: false,
    };
    dec(target, key, descriptor);
    Object.defineProperty(target, key, descriptor);
}

describe("Exception 装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("@Exception(key, message)", () => {
        it("原方法成功：正常返回原值", async () => {
            class Ctrl {
                @ExceptionDecorator("ERR_KEY", "失败描述")
                async ok() {
                    return { v: 1 };
                }
            }
            const ctrl = new Ctrl();
            await expect(ctrl.ok()).resolves.toEqual({ v: 1 });
        });

        it("原方法抛错：给 err 打上 errorKey/errorMessage", async () => {
            class Ctrl {
                @ExceptionDecorator("API_ERROR", "出错了")
                async fail() {
                    throw new Error("原生错误");
                }
            }
            const ctrl = new Ctrl();
            await expect(ctrl.fail()).rejects.toThrow("原生错误");
            try {
                await ctrl.fail();
            } catch (err: any) {
                expect(err.errorKey).toBe("API_ERROR");
                expect(err.errorMessage).toBe("出错了");
            }
        });

        it("err 已有 errorKey 时保留原值", async () => {
            class Ctrl {
                @ExceptionDecorator("OUTER", "外层")
                async fail() {
                    const e: any = new Error("x");
                    e.errorKey = "INNER";
                    e.errorMessage = "内层";
                    throw e;
                }
            }
            const ctrl = new Ctrl();
            try {
                await ctrl.fail();
                throw new Error("应抛错");
            } catch (err: any) {
                expect(err.errorKey).toBe("INNER");
                expect(err.errorMessage).toBe("内层");
            }
        });

        it("err 已有 errorMessage 时保留原值", async () => {
            class Ctrl {
                @ExceptionDecorator("K", "外层 msg")
                async fail() {
                    const e: any = new Error("x");
                    e.errorMessage = "已有 msg";
                    throw e;
                }
            }
            const ctrl = new Ctrl();
            try {
                await ctrl.fail();
                throw new Error("应抛错");
            } catch (err: any) {
                expect(err.errorMessage).toBe("已有 msg");
            }
        });

        it("无 message 参数时 errorMessage 回退到 err.message", async () => {
            class Ctrl {
                @ExceptionDecorator("ONLY_KEY")
                async fail() {
                    throw new Error("原始错误信息");
                }
            }
            const ctrl = new Ctrl();
            try {
                await ctrl.fail();
                throw new Error("应抛错");
            } catch (err: any) {
                expect(err.errorKey).toBe("ONLY_KEY");
                // 源码：err.errorMessage || message || err.message
                // 无 message 参数时取 err.message
                expect(err.errorMessage).toBe("原始错误信息");
            }
        });
    });

    describe("@Catched", () => {
        it("写入 CATCH_KEY：errorKey", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(Catched("API_*"), Ctrl.prototype, "m");
            const metas = container.listPropertyData<CatchDefinition>(
                CATCH_KEY,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            expect(metas[0].data.errorKey).toBe("API_*");
            expect(metas[0].propertyKey).toBe("m");
        });

        it("精确匹配 key", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(Catched("API_USER_NOT_FOUND"), Ctrl.prototype, "m");
            const meta = container.listPropertyData<CatchDefinition>(
                CATCH_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.errorKey).toBe("API_USER_NOT_FOUND");
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
            const ret = Catched("X")(Ctrl.prototype, "m", descriptor);
            expect(ret).toBe(descriptor);
        });
    });
});
