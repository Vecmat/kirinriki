import "reflect-metadata";
import {
    AppRegistry,
    appRegistry,
    type AppDefinition,
} from "../../src/core/app-registry";
import { resetGlobals } from "../helpers/reset";

describe("AppRegistry", () => {
    let reg: AppRegistry;

    beforeEach(() => {
        resetGlobals();
        reg = AppRegistry.getInstance();
    });

    function makeDef(name: string, base = `/${name}`): AppDefinition {
        return {
            name,
            basePath: base,
            appDir: "/tmp",
            appHash: `${name}-hash`,
        };
    }

    describe("register / get / has", () => {
        it("register 后可按 name 获取；has 返回 true", () => {
            reg.register(makeDef("auth", "/auth"));
            expect(reg.has("auth")).toBe(true);
            const def = reg.get("auth");
            expect(def).toBeDefined();
            expect(def?.basePath).toBe("/auth");
            expect(def?.appHash).toBe("auth-hash");
        });

        it("未注册 name：get 返回 undefined、has 返回 false", () => {
            expect(reg.get("unknown")).toBeUndefined();
            expect(reg.has("unknown")).toBe(false);
        });

        it("同名重复注册以最后一次为准", () => {
            reg.register(makeDef("auth", "/auth"));
            reg.register(makeDef("auth", "/v2"));
            expect(reg.get("auth")?.basePath).toBe("/v2");
        });
    });

    describe("bindController / getByController", () => {
        it("绑定后可按控制器类反查所属应用", () => {
            class AuthController {}
            reg.register(makeDef("auth", "/auth"));
            reg.bindController(AuthController, "auth");
            const def = reg.getByController(AuthController);
            expect(def).toBeDefined();
            expect(def?.name).toBe("auth");
        });

        it("未绑定的控制器返回 undefined", () => {
            class FreeController {}
            expect(reg.getByController(FreeController)).toBeUndefined();
        });

        it("绑定到不存在的应用名：getByController 返回 undefined", () => {
            class Ctrl {}
            reg.bindController(Ctrl, "missing-app");
            expect(reg.getByController(Ctrl)).toBeUndefined();
        });
    });

    describe("list", () => {
        it("返回全部已注册应用", () => {
            reg.register(makeDef("auth"));
            reg.register(makeDef("payment"));
            const all = reg.list();
            expect(all).toHaveLength(2);
            expect(all.map((d) => d.name).sort()).toEqual(["auth", "payment"]);
        });

        it("空注册表返回空数组", () => {
            expect(reg.list()).toEqual([]);
        });
    });

    describe("全局单例", () => {
        it("getInstance 返回同一实例", () => {
            expect(AppRegistry.getInstance()).toBe(AppRegistry.getInstance());
        });

        it("导出的 appRegistry 与 getInstance 一致", () => {
            expect(appRegistry).toBe(AppRegistry.getInstance());
        });
    });
});
