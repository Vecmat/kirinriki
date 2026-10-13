import "reflect-metadata";
import {
    InjectAspect,
    Before,
    After,
    Around,
    AopType,
    type AspectDefinition,
} from "../../src/decorators/aop";
import { container } from "../../src/core/container";
import { ASPECT_KEY } from "../../src/core/define";
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

describe("AOP 装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("InjectAspect", () => {
        it("写入 ASPECT_KEY：type 与 exec", () => {
            class Ctrl {
                m() {}
            }
            const exec = () => {};
            applyMethod(InjectAspect(AopType.BEFORE, exec), Ctrl.prototype, "m");
            const metas = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            expect(metas[0].data.type).toBe(AopType.BEFORE);
            expect(metas[0].data.exec).toBe(exec);
            expect(metas[0].propertyKey).toBe("m");
        });

        it("exec 为字符串（组件 id）", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(InjectAspect(AopType.AROUND, "LogAspect"), Ctrl.prototype, "m");
            const meta = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.exec).toBe("LogAspect");
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
            const ret = InjectAspect(AopType.BEFORE, () => {})(Ctrl.prototype, "m", descriptor);
            expect(ret).toBe(descriptor);
        });
    });

    describe("语法糖", () => {
        it("@Before 写入 BEFORE 类型", () => {
            class Ctrl {
                m() {}
            }
            const exec = () => {};
            applyMethod(Before(exec), Ctrl.prototype, "m");
            const meta = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.type).toBe(AopType.BEFORE);
            expect(meta.data.exec).toBe(exec);
        });

        it("@After 写入 AFTER 类型", () => {
            class Ctrl {
                m() {}
            }
            const exec = () => {};
            applyMethod(After(exec), Ctrl.prototype, "m");
            const meta = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.type).toBe(AopType.AFTER);
        });

        it("@Around 写入 AROUND 类型", () => {
            class Ctrl {
                m() {}
            }
            const exec = (_ctx: any, _next: any) => {};
            applyMethod(Around(exec), Ctrl.prototype, "m");
            const meta = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.type).toBe(AopType.AROUND);
        });

        it("字符串形式可被 @Before 使用", () => {
            class Ctrl {
                m() {}
            }
            applyMethod(Before("LogAspect"), Ctrl.prototype, "m");
            const meta = container.listPropertyData<AspectDefinition>(
                ASPECT_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.exec).toBe("LogAspect");
            expect(meta.data.type).toBe(AopType.BEFORE);
        });
    });
});
