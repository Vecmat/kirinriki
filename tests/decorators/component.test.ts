import "reflect-metadata";
import {
    Component,
    Service,
    Controller,
    Action,
    Middleware,
    Autowired,
    Inject,
} from "../../src/decorators/component";
import { container, BeanType, BeanScope } from "../../src/core/container";
import { CONTROLLER_KEY, AUTOWIRED_KEY } from "../../src/core/define";
import { appRegistry } from "../../src/core/app-registry";
import { Exception } from "../../src/core/exception";
import { resetGlobals } from "../helpers/reset";

describe("Component 系列装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("@Component", () => {
        it("注册为 COMPONENT Bean，id 默认类名", () => {
            class MyComponent {}
            const dec = Component();
            (dec as ClassDecorator)(MyComponent);
            expect(container.has("MyComponent")).toBe(true);
            const def = container
                .getDefinitions()
                .find((d) => d.id === "MyComponent");
            expect(def?.type).toBe(BeanType.COMPONENT);
            expect(def?.scope).toBe(BeanScope.SINGLETON);
            expect(def?.clazz).toBe(MyComponent);
        });

        it("自定义 id 与 scope", () => {
            class C {}
            Component({ id: "custom-c", scope: BeanScope.PROTOTYPE })(C);
            expect(container.has("custom-c")).toBe(true);
            const def = container
                .getDefinitions()
                .find((d) => d.id === "custom-c");
            expect(def?.scope).toBe(BeanScope.PROTOTYPE);
        });

        it("priority 默认 0；可自定义", () => {
            class P {}
            Component({ priority: 5 })(P);
            const def = container.getDefinitions().find((d) => d.id === "P");
            expect(def?.priority).toBe(5);
        });
    });

    describe("@Service / @Action / @Middleware", () => {
        it("@Service 注册为 SERVICE", () => {
            class Svc {}
            Service()(Svc);
            const def = container.getDefinitions().find((d) => d.id === "Svc");
            expect(def?.type).toBe(BeanType.SERVICE);
        });

        it("@Action 第一个参数为 id（与 Component 不同）", () => {
            class MyAction {}
            Action("act-id")(MyAction);
            expect(container.has("act-id")).toBe(true);
            const def = container
                .getDefinitions()
                .find((d) => d.id === "act-id");
            expect(def?.type).toBe(BeanType.COMPONENT);
        });

        it("@Middleware 注册为 MIDDLEWARE", () => {
            class Mw {}
            Middleware()(Mw);
            const def = container.getDefinitions().find((d) => d.id === "Mw");
            expect(def?.type).toBe(BeanType.MIDDLEWARE);
        });
    });

    describe("@Controller", () => {
        it("注册为 CONTROLLER 并写入 CONTROLLER_KEY 元数据", () => {
            class UserController {}
            Controller("/user")(UserController);
            const def = container
                .getDefinitions()
                .find((d) => d.id === "UserController");
            expect(def?.type).toBe(BeanType.CONTROLLER);
            const meta = container.getPropertyData<{ path: string }>(
                CONTROLLER_KEY,
                UserController,
            );
            expect(meta).toEqual([{ path: "/user" }]);
        });

        it("path 默认 /", () => {
            class RootCtrl {}
            Controller()(RootCtrl);
            const meta = container.getPropertyData<{ path: string }>(
                CONTROLLER_KEY,
                RootCtrl,
            );
            expect(meta[0]?.path).toBe("/");
        });

        it("指定 app 时绑定到 AppRegistry", () => {
            appRegistry.register({
                name: "auth",
                basePath: "/auth",
                appDir: "",
                appHash: "h",
            });
            class AuthCtrl {}
            Controller("/", { app: "auth" })(AuthCtrl);
            const def = appRegistry.getByController(AuthCtrl);
            expect(def?.name).toBe("auth");
        });

        it("自定义 id 时不影响 CONTROLLER_KEY 元数据", () => {
            class C {}
            Controller("/x", { id: "renamed" })(C);
            expect(container.has("renamed")).toBe(true);
            expect(container.has("C")).toBe(false);
            expect(
                container.getPropertyData<{ path: string }>(
                    CONTROLLER_KEY,
                    C,
                )[0]?.path,
            ).toBe("/x");
        });
    });

    describe("非 Controller 类误用路由装饰器", () => {
        it("@Component 类上误挂 @Get 抛 BOOTERR_DEPRO_UNSUITED", () => {
            // 模拟方法装饰器先执行（写入 ROUTER_KEY 元数据），
            // 再执行类装饰器 registerBean 时应抛异常
            class BadService {
                static method() {}
            }
            // 先把 ROUTER_KEY 写到 BadService 原型上（模拟 @Get 装饰器已应用）
            container.attachPropertyData(
                "ROUTER_KEY",
                {
                    path: "/",
                    requestMethod: "GET",
                    routerName: "",
                    method: "x",
                },
                BadService.prototype,
                "x",
            );
            expect(() => {
                Component()(BadService);
            }).toThrow(Exception);
            try {
                Component()(BadService);
            } catch (e) {
                const ex = e as Exception;
                expect(ex.errorKey).toBe("BOOTERR_DEPRO_UNSUITED");
            }
        });
    });

    describe("@Autowired / @Inject", () => {
        it("@Autowired(Class) 用类名作为 id", () => {
            class Dep {}
            class Holder {
                @Autowired(Dep)
                dep!: Dep;
            }
            const metas = container.listPropertyData<{
                propertyKey: string | symbol;
                id: string;
            }>(AUTOWIRED_KEY, Holder);
            expect(metas).toHaveLength(1);
            expect(metas[0].data.id).toBe("Dep");
            expect(metas[0].data.propertyKey).toBe("dep");
        });

        it("@Autowired(string) 用字符串 id", () => {
            class Holder {
                @Autowired("my-dep")
                dep!: unknown;
            }
            const metas = container.listPropertyData<{
                propertyKey: string | symbol;
                id: string;
            }>(AUTOWIRED_KEY, Holder);
            expect(metas[0].data.id).toBe("my-dep");
        });

        it("@Autowired() 无参时回退到 design:type.name", () => {
            class Typed {}
            class Holder {
                @Autowired()
                prop!: Typed;
            }
            const metas = container.listPropertyData<{
                propertyKey: string | symbol;
                id: string | undefined;
            }>(AUTOWIRED_KEY, Holder);
            // 实例字段 design:type 由 TS 元数据发射提供
            expect(metas[0].data.id).toBe("Typed");
        });

        it("@Inject(id) 直接写入 AUTOWIRED_KEY", () => {
            class Holder {
                @Inject("injected")
                prop!: unknown;
            }
            const metas = container.listPropertyData<{
                propertyKey: string | symbol;
                id: string;
            }>(AUTOWIRED_KEY, Holder);
            expect(metas[0].data.id).toBe("injected");
            expect(metas[0].data.propertyKey).toBe("prop");
        });
    });
});
