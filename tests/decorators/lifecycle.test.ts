import "reflect-metadata";
import { Kirinriki } from "../../src/core/app";
import { container } from "../../src/core/container";
import { LIFECYCLE_KEY, LifecycleEvent } from "../../src/core/define";
import { Component, Service } from "../../src/decorators/component";
import { OnInit, OnReady, OnDestroy } from "../../src/decorators/lifecycle";
import { resetGlobals } from "../helpers/reset";

describe("生命周期钩子", () => {
    beforeEach(() => resetGlobals());

    describe("装饰器元数据注册", () => {
        it("@OnInit/@OnReady/@OnDestroy 注册到 LIFECYCLE_KEY", () => {
            @Component()
            class HookBean {
                @OnInit()
                boot() {}

                @OnReady()
                ready() {}

                @OnDestroy()
                cleanup() {}
            }
            void HookBean;

            const metas = container.listPropertyData<{ event: LifecycleEvent }>(
                LIFECYCLE_KEY,
                HookBean,
            );
            const byMethod = Object.fromEntries(
                metas.map((m) => [m.propertyKey, m.data.event]),
            );
            expect(byMethod).toEqual({
                boot: LifecycleEvent.INIT,
                ready: LifecycleEvent.READY,
                cleanup: LifecycleEvent.DESTROY,
            });
        });
    });

    describe("init() 触发顺序", () => {
        it("Bean 钩子与函数钩子按 INIT→READY 依次触发", async () => {
            const calls: string[] = [];

            @Service()
            class Svc {
                @OnInit()
                prepare() {
                    calls.push("bean:init");
                }

                @OnReady()
                boot() {
                    calls.push("bean:ready");
                }
            }
            void Svc;

            const app = new Kirinriki({ silent: true });
            app.onInit(() => {
                calls.push("fn:init");
            });
            app.onReady(() => {
                calls.push("fn:ready");
            });
            await app.init();

            expect(calls).toEqual([
                "bean:init",
                "fn:init",
                "bean:ready",
                "fn:ready",
            ]);
        });

        it("钩子入参为 Kirinriki 应用实例", async () => {
            let received: unknown;
            @Component()
            class C {
                @OnInit()
                hook(app: unknown) {
                    received = app;
                }
            }
            void C;

            const app = new Kirinriki({ silent: true });
            await app.init();
            expect(received).toBe(app);
        });

        it("多个 Bean 的钩子按注册顺序串行执行", async () => {
            const calls: string[] = [];

            @Component()
            class A {
                @OnInit()
                hook() {
                    calls.push("A");
                }
            }

            @Component()
            class B {
                @OnInit()
                hook() {
                    calls.push("B");
                }
            }
            void A;
            void B;

            const app = new Kirinriki({ silent: true });
            await app.init();
            expect(calls).toEqual(["A", "B"]);
        });

        it("支持异步钩子，await 后才进入下一阶段", async () => {
            const calls: string[] = [];

            @Component()
            class C {
                @OnInit()
                async hook() {
                    await new Promise((r) => setTimeout(r, 10));
                    calls.push("async:init");
                }
            }
            void C;

            const app = new Kirinriki({ silent: true });
            app.onReady(() => {
                calls.push("ready");
            });
            await app.init();
            expect(calls).toEqual(["async:init", "ready"]);
        });

        it("函数钩子支持链式注册", async () => {
            const calls: string[] = [];
            const app = new Kirinriki({ silent: true });
            const ret = app
                .onInit(() => {
                    calls.push("1");
                })
                .onInit(() => {
                    calls.push("2");
                });
            expect(ret).toBe(app);
            await app.init();
            expect(calls).toEqual(["1", "2"]);
        });
    });

    describe("destroy() 触发", () => {
        it("Bean @OnDestroy 与 onDestroy 函数均执行", async () => {
            const calls: string[] = [];

            @Service()
            class Svc {
                @OnDestroy()
                cleanup() {
                    calls.push("bean:destroy");
                }
            }
            void Svc;

            const app = new Kirinriki({ silent: true });
            app.onDestroy(() => {
                calls.push("fn:destroy");
            });
            await app.init();
            expect(calls).toEqual([]);

            await app.destroy();
            expect(calls).toEqual(["bean:destroy", "fn:destroy"]);
        });

        it("destroy 不影响 INIT/READY 钩子（事件隔离）", async () => {
            const calls: string[] = [];

            @Component()
            class C {
                @OnInit()
                boot() {
                    calls.push("init");
                }

                @OnDestroy()
                cleanup() {
                    calls.push("destroy");
                }
            }
            void C;

            const app = new Kirinriki({ silent: true });
            await app.init();
            await app.destroy();
            expect(calls).toEqual(["init", "destroy"]);
        });
    });
});
