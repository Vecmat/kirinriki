import "reflect-metadata";
import {
    App,
    createAppDecorators,
    type AppOptions,
} from "../../src/decorators/app";
// 引用真正的装饰器实现用于"透传一致"断言（app.ts 内部 import 这些再透传给工厂返回集）
import {
    Component,
    Service,
    Action,
    Middleware,
    Autowired,
    Inject,
} from "../../src/decorators/component";
import {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Options,
    Head,
    All,
} from "../../src/decorators/route";
import {
    ParamsQuery,
    ParamsPath,
    ParamsBody,
    ParamsHeader,
    Ctx,
} from "../../src/decorators/param";
import { Valid, Validated } from "../../src/decorators/validation";
import { Use, Before, After } from "../../src/decorators/Savant";
import {
    OnOpen,
    OnMessage,
    OnClose,
    OnError,
} from "../../src/decorators/websocket";
import { appRegistry } from "../../src/core/app-registry";
import { CONTROLLER_KEY } from "../../src/core/define";
import { container } from "../../src/core/container";
import { resetGlobals } from "../helpers/reset";

describe("@App / createAppDecorators", () => {
    beforeEach(() => resetGlobals());

    const opts: AppOptions = {
        name: "auth",
        basePath: "/auth",
        hash: "abc123",
        staticDir: "apps/auth/static",
    };

    describe("@App", () => {
        it("register 到 AppRegistry", () => {
            class AuthApp {}
            App(opts)(AuthApp);
            const def = appRegistry.get("auth");
            expect(def).toBeDefined();
            expect(def?.name).toBe("auth");
            expect(def?.basePath).toBe("/auth");
            expect(def?.appHash).toBe("abc123");
            expect(def?.staticDir).toBe("apps/auth/static");
        });
    });

    describe("createAppDecorators", () => {
        it("返回包含所有装饰器键的对象", () => {
            const set = createAppDecorators(opts);
            expect(typeof set.App).toBe("function");
            expect(typeof set.Controller).toBe("function");
            expect(typeof set.Component).toBe("function");
            expect(typeof set.Service).toBe("function");
            expect(typeof set.Action).toBe("function");
            expect(typeof set.Middleware).toBe("function");
            expect(typeof set.Autowired).toBe("function");
            expect(typeof set.Inject).toBe("function");
            for (const fn of [
                set.Get,
                set.Post,
                set.Put,
                set.Delete,
                set.Patch,
                set.Options,
                set.Head,
                set.All,
            ]) {
                expect(typeof fn).toBe("function");
            }
            for (const fn of [
                set.ParamsQuery,
                set.ParamsPath,
                set.ParamsBody,
                set.ParamsHeader,
                set.Ctx,
            ]) {
                expect(typeof fn).toBe("function");
            }
            expect(typeof set.Valid).toBe("function");
            expect(typeof set.Validated).toBe("function");
            expect(typeof set.Use).toBe("function");
            expect(typeof set.Before).toBe("function");
            expect(typeof set.After).toBe("function");
            for (const fn of [
                set.OnOpen,
                set.OnMessage,
                set.OnClose,
                set.OnError,
            ]) {
                expect(typeof fn).toBe("function");
            }
        });

        it("App() 等价 App(opts)", () => {
            const set = createAppDecorators(opts);
            class A {}
            set.App()(A);
            expect(appRegistry.get("auth")?.basePath).toBe("/auth");
        });

        it("Controller(path) 自动注入 app 选项", () => {
            const set = createAppDecorators(opts);
            // 需先注册应用定义，getByController 才能反查到 app
            class AuthApp {}
            set.App()(AuthApp);
            class C {}
            set.Controller("/login")(C);
            const def = appRegistry.getByController(C);
            expect(def?.name).toBe("auth");
            const pathMeta = container.getPropertyData<{ path: string }>(
                CONTROLLER_KEY,
                C,
            );
            expect(pathMeta).toEqual([{ path: "/login" }]);
        });

        it("透传的装饰器与原导出一致", () => {
            const set = createAppDecorators(opts);
            expect(set.Component).toBe(Component);
            expect(set.Service).toBe(Service);
            expect(set.Action).toBe(Action);
            expect(set.Middleware).toBe(Middleware);
            expect(set.Autowired).toBe(Autowired);
            expect(set.Inject).toBe(Inject);
            expect(set.Get).toBe(Get);
            expect(set.Post).toBe(Post);
            expect(set.Put).toBe(Put);
            expect(set.Delete).toBe(Delete);
            expect(set.Patch).toBe(Patch);
            expect(set.Options).toBe(Options);
            expect(set.Head).toBe(Head);
            expect(set.All).toBe(All);
            expect(set.ParamsQuery).toBe(ParamsQuery);
            expect(set.ParamsPath).toBe(ParamsPath);
            expect(set.ParamsBody).toBe(ParamsBody);
            expect(set.ParamsHeader).toBe(ParamsHeader);
            expect(set.Ctx).toBe(Ctx);
            expect(set.Valid).toBe(Valid);
            expect(set.Validated).toBe(Validated);
            expect(set.Use).toBe(Use);
            expect(set.Before).toBe(Before);
            expect(set.After).toBe(After);
            expect(set.OnOpen).toBe(OnOpen);
            expect(set.OnMessage).toBe(OnMessage);
            expect(set.OnClose).toBe(OnClose);
            expect(set.OnError).toBe(OnError);
        });
    });
});
