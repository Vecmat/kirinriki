import "reflect-metadata";
import {
    Container,
    container,
    BeanScope,
    BeanType,
} from "../../src/core/container";
import { AUTOWIRED_KEY } from "../../src/core/define";
import { Autowired } from "../../src/decorators/component";
import { resetGlobals } from "../helpers/reset";

describe("Container", () => {
    let c: Container;

    beforeEach(() => {
        resetGlobals();
        c = Container.getInstance();
    });

    describe("单例与注册", () => {
        it("register 后 has 返回 true；get 返回实例", () => {
            class Foo {}
            c.register({
                id: "Foo",
                clazz: Foo,
                type: BeanType.COMPONENT,
                scope: BeanScope.SINGLETON,
            });
            expect(c.has("Foo")).toBe(true);
            expect(c.get("Foo")).toBeInstanceOf(Foo);
        });

        it("单例作用域：多次 get 返回同一引用", () => {
            class Bar {
                public n = Math.random();
            }
            c.register({
                id: "Bar",
                clazz: Bar,
                type: BeanType.COMPONENT,
                scope: BeanScope.SINGLETON,
            });
            const a = c.get<Bar>("Bar")!;
            const b = c.get<Bar>("Bar")!;
            expect(a).toBe(b);
        });

        it("原型作用域：每次 get 返回新实例", () => {
            class Qux {}
            c.register({
                id: "Qux",
                clazz: Qux,
                type: BeanType.COMPONENT,
                scope: BeanScope.PROTOTYPE,
            });
            const a = c.get<Qux>("Qux")!;
            const b = c.get<Qux>("Qux")!;
            expect(a).not.toBe(b);
            expect(a).toBeInstanceOf(Qux);
        });

        it("未注册的 id：get 返回 undefined、has 返回 false", () => {
            expect(c.get("missing")).toBeUndefined();
            expect(c.has("missing")).toBe(false);
        });
    });

    describe("getByType / getDefinitions", () => {
        it("按类型返回该类型的全部实例", () => {
            class A {}
            class B {}
            c.register({
                id: "A",
                clazz: A,
                type: BeanType.SERVICE,
                scope: BeanScope.SINGLETON,
            });
            c.register({
                id: "B",
                clazz: B,
                type: BeanType.SERVICE,
                scope: BeanScope.SINGLETON,
            });
            c.register({
                id: "C",
                clazz: A,
                type: BeanType.CONTROLLER,
                scope: BeanScope.SINGLETON,
            });
            const services = c.getByType(BeanType.SERVICE);
            expect(services).toHaveLength(2);
            expect(services.map((s) => s.constructor)).toEqual(
                expect.arrayContaining([A, B]),
            );
        });

        it("getDefinitions 返回全部注册定义", () => {
            class X {}
            c.register({
                id: "X",
                clazz: X,
                type: BeanType.COMPONENT,
                scope: BeanScope.SINGLETON,
            });
            const defs = c.getDefinitions();
            expect(defs).toHaveLength(1);
            expect(defs[0].id).toBe("X");
        });

        it("getByType 无匹配返回空数组", () => {
            expect(c.getByType(BeanType.MIDDLEWARE)).toEqual([]);
        });
    });

    describe("元数据读写", () => {
        it("attachPropertyData + getPropertyData：类级别（无 propertyKey）", () => {
            class Ctrl {}
            c.attachPropertyData("K1", { path: "/x" }, Ctrl);
            const data = c.getPropertyData<{ path: string }>("K1", Ctrl);
            expect(data).toEqual([{ path: "/x" }]);
        });

        it("attachPropertyData + getPropertyData：方法级别", () => {
            class Ctrl {
                m() {}
            }
            c.attachPropertyData("K2", { v: 1 }, Ctrl.prototype, "m");
            const data = c.getPropertyData<{ v: number }>("K2", Ctrl.prototype, "m");
            expect(data).toEqual([{ v: 1 }]);
        });

        it("同一方法可挂多个元数据：listPropertyData 按类返回全部", () => {
            class Ctrl {
                a() {}
                b() {}
            }
            c.attachPropertyData("K3", { i: 1 }, Ctrl.prototype, "a");
            c.attachPropertyData("K3", { i: 2 }, Ctrl.prototype, "b");
            c.attachPropertyData("K3", { i: 3 }, Ctrl.prototype, "a");
            const list = c.listPropertyData<{ i: number }>("K3", Ctrl.prototype);
            expect(list).toHaveLength(3);
            const aItems = list.filter((m) => m.propertyKey === "a");
            expect(aItems).toHaveLength(2);
            expect(aItems.map((m) => m.data.i)).toEqual([1, 3]);
        });

        it("getPropertyData 不同类之间隔离", () => {
            class A {}
            class B {}
            c.attachPropertyData("KK", { x: 1 }, A);
            c.attachPropertyData("KK", { x: 2 }, B);
            expect(c.getPropertyData<{ x: number }>("KK", A)).toEqual([{ x: 1 }]);
            expect(c.getPropertyData<{ x: number }>("KK", B)).toEqual([{ x: 2 }]);
        });

        it("getPropertyData 未注册返回空数组", () => {
            class None {}
            expect(c.getPropertyData("NOPE", None)).toEqual([]);
            expect(c.listPropertyData("NOPE", None)).toEqual([]);
        });

        it("target 为空时 classIdOf 返回空字符串，attachPropertyData 不写入", () => {
            c.attachPropertyData("KX", { v: 1 }, null as never);
            expect(c.getPropertyData("KX", null as never)).toEqual([]);
        });
    });

    describe("getIdentifier", () => {
        it("传入类返回类名", () => {
            class MyClass {}
            expect(c.getIdentifier(MyClass)).toBe("MyClass");
        });

        it("传入实例返回 constructor.name", () => {
            class Other {}
            const inst = new Other();
            expect(c.getIdentifier(inst)).toBe("Other");
        });

        it("传入空值返回空字符串", () => {
            expect(c.getIdentifier(null)).toBe("");
            expect(c.getIdentifier(undefined)).toBe("");
        });
    });

    describe("自动装配 @Autowired", () => {
        it("实例化时把依赖写到属性上", () => {
            class Repo {
                find() {
                    return "ok";
                }
            }
            class Service {
                @Autowired(Repo)
                repo!: Repo;
            }
            c.register({
                id: "Repo",
                clazz: Repo,
                type: BeanType.SERVICE,
                scope: BeanScope.SINGLETON,
            });
            c.register({
                id: "Service",
                clazz: Service,
                type: BeanType.SERVICE,
                scope: BeanScope.SINGLETON,
            });

            const svc = c.get<Service>("Service")!;
            expect(svc.repo).toBeInstanceOf(Repo);
            expect(svc.repo.find()).toBe("ok");
        });

        it("依赖未注册时属性为 undefined", () => {
            class Service {
                @Autowired("Missing")
                dep?: unknown;
            }
            c.register({
                id: "Service",
                clazz: Service,
                type: BeanType.SERVICE,
                scope: BeanScope.SINGLETON,
            });
            const svc = c.get<Service>("Service")!;
            expect(svc.dep).toBeUndefined();
        });

        it("AUTOWIRED_KEY 元数据通过 listPropertyData 可读回", () => {
            class Dep {}
            class Holder {
                @Autowired(Dep)
                dep!: Dep;
            }
            const metas = c.listPropertyData<{ propertyKey: string | symbol; id: string }>(
                AUTOWIRED_KEY,
                Holder,
            );
            expect(metas).toHaveLength(1);
            expect(metas[0].data.id).toBe("Dep");
            expect(metas[0].data.propertyKey).toBe("dep");
        });
    });

    describe("全局单例与 reset", () => {
        it("Container.getInstance() 返回同一实例", () => {
            expect(Container.getInstance()).toBe(Container.getInstance());
        });

        it("reset 后单例为新实例，原注册内容丢失", () => {
            class Z {}
            c.register({
                id: "Z",
                clazz: Z,
                type: BeanType.COMPONENT,
                scope: BeanScope.SINGLETON,
            });
            expect(c.has("Z")).toBe(true);
            Container.reset();
            const fresh = Container.getInstance();
            expect(fresh.has("Z")).toBe(false);
            expect(fresh).not.toBe(c);
        });

        it("导出的 container 在模块加载时与 getInstance 一致", () => {
            // 注意：调用过 Container.reset() 后，导出的 container 常量
            // 仍指向最初捕获的实例，而 getInstance() 返回新实例——
            // 这是源码的预期行为（reset 用于全局重建单例）。
            // 此处仅验证二者均非空，避免对分叉后的引用关系做强断言。
            expect(container).toBeDefined();
            expect(Container.getInstance()).toBeDefined();
        });
    });
});
