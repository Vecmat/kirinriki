import "reflect-metadata";
import { ServiceRegistry } from "../../src/core/services";

describe("ServiceRegistry", () => {
    let registry: ServiceRegistry;

    beforeEach(() => {
        registry = new ServiceRegistry();
    });

    it("set/get/has/listNames 基本读写", () => {
        expect(registry.has("redis")).toBe(false);
        registry.set("redis", { kind: "client" });
        expect(registry.has("redis")).toBe(true);
        expect(registry.get("redis")).toEqual({ kind: "client" });
        expect(registry.listNames()).toEqual(["redis"]);
    });

    it("get 泛型断言返回原对象，require 返回已注册服务", () => {
        const client = { ping: () => "PONG" };
        registry.set("redis", client);
        expect(registry.require<{ ping(): string }>("redis")).toBe(client);
        expect(registry.require<{ ping(): string }>("redis").ping()).toBe(
            "PONG",
        );
    });

    it("get 未注册返回 undefined，require 未注册抛 SERVICE_NOT_FOUND", () => {
        expect(registry.get("redis")).toBeUndefined();
        expect(() => registry.require("redis")).toThrow(/未注册/);
        try {
            registry.require("redis");
        } catch (e: any) {
            expect(e.errorKey).toBe("SERVICE_NOT_FOUND");
        }
    });

    it("set 重复注册抛 SERVICE_DUPLICATED；remove 后可重新注册", () => {
        registry.set("redis", { v: 1 });
        expect(() => registry.set("redis", { v: 2 })).toThrow(/已注册/);
        expect(registry.get("redis")).toEqual({ v: 1 });
        expect(registry.remove("redis")).toBe(true);
        registry.set("redis", { v: 2 });
        expect(registry.get("redis")).toEqual({ v: 2 });
    });

    it("remove 返回是否存在，clear 清空全部", () => {
        registry.set("a", 1);
        registry.set("b", 2);
        expect(registry.remove("a")).toBe(true);
        expect(registry.remove("a")).toBe(false);
        registry.clear();
        expect(registry.listNames()).toEqual([]);
    });
});
