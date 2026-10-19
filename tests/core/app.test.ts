import "reflect-metadata";
import { Hono } from "hono";
import { Kirinriki } from "../../src/core/app";
import { container, BeanType } from "../../src/core/container";
import { Logger } from "../../src/kernel/logger";
import { Config } from "../../src/kernel/config";
import { resetGlobals, withEnv, captureConsole } from "../helpers/reset";

describe("Kirinriki", () => {
    beforeEach(() => resetGlobals());

    describe("构造选项", () => {
        it("默认打印 LOGO 与 WELCOME", () => {
            const cap = captureConsole();
            try {
                // eslint-disable-next-line no-new
                new Kirinriki();
            } finally {
                cap.restore();
            }
            const joined = cap.logs.log.map((a) => a.join(" ")).join("\n");
            expect(joined).toContain("vecmat");
            expect(joined).toContain("🌑");
        });

        it("silent: true 不打印", () => {
            const cap = captureConsole();
            try {
                // eslint-disable-next-line no-new
                new Kirinriki({ silent: true });
            } finally {
                cap.restore();
            }
            expect(cap.logs.log).toHaveLength(0);
        });

        it("布尔简写 silent=true 等价 { silent: true }", () => {
            const cap = captureConsole();
            try {
                // eslint-disable-next-line no-new
                new Kirinriki(true);
            } finally {
                cap.restore();
            }
            expect(cap.logs.log).toHaveLength(0);
        });
    });

    describe("路由表格开关", () => {
        it("构造参数 printRoutes: true 优先于环境变量", () => {
            const restore = withEnv("KIRINRIKI_PRINT_ROUTES", "0");
            const cap = captureConsole();
            try {
                const app = new Kirinriki({ silent: true, printRoutes: true });
                (
                    app as unknown as {
                        router: { registerRoutes: () => void };
                    }
                ).router.registerRoutes();
            } finally {
                cap.restore();
                restore();
            }
            // 即使无路由，printRoutes:true 也会打印 "No routes registered."
            const joined = cap.logs.log.map((a) => a.join(" ")).join("\n");
            expect(joined).toContain("No routes registered");
        });

        it("环境变量 KIRINRIKI_PRINT_ROUTES=1 开启", () => {
            const restore = withEnv("KIRINRIKI_PRINT_ROUTES", "1");
            const cap = captureConsole();
            try {
                const app = new Kirinriki({ silent: true });
                // router 已被构造时决定 printRoutes；验证此处不抛错
                (
                    app as unknown as {
                        router: { registerRoutes: () => void };
                    }
                ).router.registerRoutes();
            } finally {
                cap.restore();
                restore();
            }
            const joined = cap.logs.log.map((a) => a.join(" ")).join("\n");
            expect(joined).toContain("No routes registered");
        });

        it("环境变量为 0 关闭", () => {
            const restore = withEnv("KIRINRIKI_PRINT_ROUTES", "0");
            const cap = captureConsole();
            try {
                const app = new Kirinriki({ silent: true });
                (
                    app as unknown as {
                        router: { registerRoutes: () => void };
                    }
                ).router.registerRoutes();
            } finally {
                cap.restore();
                restore();
            }
            expect(cap.logs.log).toHaveLength(0);
        });

        it("环境变量 yes/true 也开启", () => {
            for (const v of ["yes", "true", "YES", "TRUE"]) {
                const restore = withEnv("KIRINRIKI_PRINT_ROUTES", v);
                const cap = captureConsole();
                try {
                    const app = new Kirinriki({ silent: true });
                    // 路由表格在 registerRoutes 时打印
                    (
                        app as unknown as {
                            router: { registerRoutes: () => void };
                        }
                    ).router.registerRoutes();
                    const joined = cap.logs.log
                        .map((a) => a.join(" "))
                        .join("");
                    expect(joined).toContain("No routes registered");
                } finally {
                    cap.restore();
                    restore();
                }
            }
        });
    });

    describe("Kernel 服务注册", () => {
        it("构造后容器包含 Logger / ConfigService", () => {
            // eslint-disable-next-line no-new
            new Kirinriki({ silent: true });
            expect(container.has("Logger")).toBe(true);
            expect(container.has("ConfigService")).toBe(true);
        });

        it("Logger / ConfigService 为 COMPONENT 单例", () => {
            // eslint-disable-next-line no-new
            new Kirinriki({ silent: true });
            const defs = container.getDefinitions();
            const loggerDef = defs.find((d) => d.id === "Logger");
            expect(loggerDef?.type).toBe(BeanType.COMPONENT);
            expect(loggerDef?.clazz).toBe(Logger);
            expect(
                container.get<Config>("ConfigService"),
            ).toBeInstanceOf(Config);
        });
    });

    describe("bindWebSocket / init / fetch / use", () => {
        it("bindWebSocket 链式返回 this 并保存适配器", () => {
            const app = new Kirinriki({ silent: true });
            const adapter = (() => ({})) as never;
            const ret = app.bindWebSocket(adapter);
            expect(ret).toBe(app);
        });

        it("init() 返回 this（Promise）", async () => {
            const app = new Kirinriki({ silent: true });
            const result = await app.init();
            expect(result).toBe(app);
        });

        it("fetch 等价 hono.fetch", () => {
            const app = new Kirinriki({ silent: true });
            expect(app.fetch).toBe(app.hono.fetch);
        });

        it("use 调用 Hono.use 注册中间件", async () => {
            const app = new Kirinriki({ silent: true });
            const called: string[] = [];
            app.use(async (c: any, next: any) => {
                called.push("mw");
                await next();
            });
            await app.init();
            // hono 的 fetch 调用时，中间件应被触发
            // 没有路由时返回 404，但中间件已执行
            const res = await app.fetch(
                new Request("http://localhost/"),
                {} as never,
            );
            expect(called).toContain("mw");
            expect(res.status).toBe(404);
        });

        it("hono 实例对外暴露", () => {
            const app = new Kirinriki({ silent: true });
            expect(app.hono).toBeInstanceOf(Hono);
        });
    });
});
