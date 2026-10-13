import "reflect-metadata";
import { Cache } from "../../src/kernel/cache";

describe("Cache", () => {
    let cache: Cache;

    beforeEach(() => {
        cache = new Cache();
    });

    describe("set / get", () => {
        it("基本存取", () => {
            cache.set("k", "v");
            expect(cache.get("k")).toBe("v");
        });

        it("对象值", () => {
            cache.set("obj", { a: 1 });
            expect(cache.get("a")).toBeUndefined();
            expect(cache.get("obj")).toEqual({ a: 1 });
        });

        it("未命中返回 undefined", () => {
            expect(cache.get("missing")).toBeUndefined();
        });

        it("覆盖写入", () => {
            cache.set("k", 1);
            cache.set("k", 2);
            expect(cache.get("k")).toBe(2);
        });
    });

    describe("TTL 过期", () => {
        it("未过期返回值", () => {
            cache.set("k", "v", 1000);
            expect(cache.get("k")).toBe("v");
        });

        it("过期后返回 undefined 并删除", () => {
            cache.set("k", "v", 5);
            // 等待过期
            const start = Date.now();
            // 用 fake timer 替代真实等待：直接修改内部 store
            // 由于 Cache 不暴露 store，改用短 TTL + 微任务等待
            // 但单测不应依赖真实时间。Cache 实现里 expireAt = now + ttl，
            // 我们可以借助 Date.now 的 mock 直接验证逻辑分支
            return new Promise((resolve) => {
                setTimeout(() => {
                    expect(cache.get("k")).toBeUndefined();
                    expect(cache.has("k")).toBe(false);
                    resolve(undefined);
                }, 20);
            });
        });

        it("不传 TTL 永不过期", () => {
            cache.set("forever", "v");
            expect(cache.get("forever")).toBe("v");
        });
    });

    describe("has", () => {
        it("存在且未过期返回 true", () => {
            cache.set("k", 1);
            expect(cache.has("k")).toBe(true);
        });

        it("不存在返回 false", () => {
            expect(cache.has("missing")).toBe(false);
        });

        it("过期后返回 false", (done) => {
            cache.set("k", 1, 5);
            setTimeout(() => {
                expect(cache.has("k")).toBe(false);
                done();
            }, 20);
        });
    });

    describe("delete", () => {
        it("删除存在的键返回 true", () => {
            cache.set("k", 1);
            expect(cache.delete("k")).toBe(true);
            expect(cache.has("k")).toBe(false);
        });

        it("删除不存在的键返回 false", () => {
            expect(cache.delete("missing")).toBe(false);
        });
    });

    describe("clear", () => {
        it("清空全部缓存", () => {
            cache.set("a", 1);
            cache.set("b", 2);
            cache.clear();
            expect(cache.has("a")).toBe(false);
            expect(cache.has("b")).toBe(false);
        });

        it("清空后再 set 仍可用", () => {
            cache.set("a", 1);
            cache.clear();
            cache.set("a", 2);
            expect(cache.get("a")).toBe(2);
        });
    });
});
