import "reflect-metadata";
import { Hono } from "hono";
import { z } from "zod";
import { Router } from "../../src/core/router";
import {
    Container,
    container,
    BeanType,
    BeanScope,
} from "../../src/core/container";
import { appRegistry } from "../../src/core/app-registry";
import { Controller, Service, Autowired } from "../../src/decorators/component";
import { Get, Post, HttpMethod } from "../../src/decorators/route";
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
    Catched,
    Exception as ExceptionDecorator,
} from "../../src/decorators/exception";
import { OnOpen } from "../../src/decorators/websocket";
import { Exception } from "../../src/core/exception";
import { resetGlobals, captureConsole } from "../helpers/reset";

/** 构造一个绑定到 Hono 的 Router 并执行 registerRoutes，返回 hono + router */
function makeRouter(printRoutes = false): { hono: Hono; router: Router } {
    const hono = new Hono();
    const router = new Router(hono, printRoutes);
    router.registerRoutes();
    return { hono, router };
}

/** 调用 hono.fetch 并解析 JSON 响应 */
async function fetchJson(
    hono: Hono,
    method: string,
    path: string,
    init: RequestInit = {},
): Promise<{ status: number; body: any }> {
    const url = new URL(path, "http://localhost");
    const req = new Request(url, { method, ...init });
    const res = await hono.fetch(req);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

function jsonBody(body: unknown): RequestInit {
    return {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    };
}

describe("Router", () => {
    let hono: Hono;
    let router: Router;

    beforeEach(() => {
        resetGlobals();
        const r = makeRouter();
        hono = r.hono;
        router = r.router;
    });

    describe("路由注册与路径拼接", () => {
        it("Controller basePath + 方法 path 拼接命中", async () => {
            @Controller("/user")
            class UserController {
                @Get("/list")
                list() {
                    return [{ id: 1 }];
                }
            }
            void UserController;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/user/list");
            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ id: 1 }]);
        });

        it("未注册路径返回 404", async () => {
            const res = await fetchJson(hono, "GET", "/not-exists");
            expect(res.status).toBe(404);
        });

        it("@App 应用 basePath 前缀拼接", async () => {
            appRegistry.register({
                name: "auth",
                basePath: "/auth",
                appDir: "",
                appHash: "h",
            });

            @Controller("/login", { app: "auth" })
            class AuthController {
                @Post("/")
                login() {
                    return { token: "abc" };
                }
            }
            void AuthController;

            const r = makeRouter();
            const res = await fetchJson(
                r.hono,
                "POST",
                "/auth/login",
                jsonBody({ user: "x" }),
            );
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ token: "abc" });
        });

        it("路径末尾斜杠规范化", async () => {
            @Controller("/api")
            class ApiController {
                @Get("/")
                root() {
                    return { ok: true };
                }
            }
            void ApiController;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api");
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    describe("参数提取", () => {
        it("@ParamsQuery 按名提取", async () => {
            @Controller("/")
            class Ctrl {
                @Get("/")
                ok(@ParamsQuery("name") name: string) {
                    return { hello: name };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/?name=alice");
            expect(res.body).toEqual({ hello: "alice" });
        });

        it("@ParamsPath 按名提取", async () => {
            @Controller("/u")
            class Ctrl {
                @Get("/:id")
                ok(@ParamsPath("id") id: string) {
                    return { id };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/u/42");
            expect(res.body).toEqual({ id: "42" });
        });

        it("@ParamsBody 提取整个 body", async () => {
            @Controller("/u")
            class Ctrl {
                @Post("/")
                ok(@ParamsBody() body: any) {
                    return { received: body };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(
                r.hono,
                "POST",
                "/u",
                jsonBody({ a: 1, b: 2 }),
            );
            expect(res.body).toEqual({ received: { a: 1, b: 2 } });
        });

        it("@ParamsHeader 按名提取", async () => {
            @Controller("/")
            class Ctrl {
                @Get("/")
                ok(@ParamsHeader("x-token") token: string) {
                    return { token };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/", {
                headers: { "x-token": "abc" },
            });
            expect(res.body).toEqual({ token: "abc" });
        });

        it("@Ctx 注入 Hono Context", async () => {
            @Controller("/")
            class Ctrl {
                @Get("/")
                ok(@Ctx() ctx: any) {
                    return { method: ctx.req.method };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/");
            expect(res.body).toEqual({ method: "GET" });
        });
    });

    describe("参数校验", () => {
        it("@Valid 校验失败抛 VALIDATION_ERROR (400)", async () => {
            @Controller("/")
            class Ctrl {
                @Get("/")
                ok(
                    @ParamsHeader("x-token")
                    @Valid((v: any) => !!v, { message: "token missing" })
                    token: string,
                ) {
                    return { token };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/");
            expect(res.status).toBe(400);
            expect(res.body.errorKey).toBe("VALIDATION_ERROR");
            expect(res.body.message).toBe("token missing");
        });

        it("@Valid 校验通过则正常调用", async () => {
            @Controller("/")
            class Ctrl {
                @Get("/")
                ok(
                    @ParamsHeader("x-token")
                    @Valid((v: any) => !!v)
                    token: string,
                ) {
                    return { token };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/", {
                headers: { "x-token": "abc" },
            });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ token: "abc" });
        });

        it("@Validated zod schema 校验失败抛 VALIDATION_ERROR", async () => {
            const schema = z.object({
                name: z.string().min(1),
                email: z.string().email(),
            });

            @Controller("/u")
            class Ctrl {
                @Post("/")
                @Validated(schema)
                ok(@ParamsBody() body: any) {
                    return { created: body };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(
                r.hono,
                "POST",
                "/u",
                jsonBody({ name: "", email: "not-email" }),
            );
            expect(res.status).toBe(400);
            expect(res.body.errorKey).toBe("VALIDATION_ERROR");
            expect(res.body.message).toContain("name");
            expect(res.body.message).toContain("email");
        });

        it("@Validated 校验通过返回 result.data", async () => {
            const schema = z.object({ name: z.string() });

            @Controller("/u")
            class Ctrl {
                @Post("/")
                @Validated(schema)
                ok(@ParamsBody() body: any) {
                    return { created: body };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(
                r.hono,
                "POST",
                "/u",
                jsonBody({ name: "alice" }),
            );
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ created: { name: "alice" } });
        });
    });

    describe("IOC 依赖注入", () => {
        it("@Autowired 装配 Service 到 Controller", async () => {
            @Service()
            class UserService {
                findAll() {
                    return [{ id: 1, name: "alice" }];
                }
            }

            @Controller("/users")
            class UserController {
                @Autowired(UserService)
                private svc!: UserService;

                @Get("/")
                list() {
                    return this.svc.findAll();
                }
            }
            void UserService;
            void UserController;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/users");
            expect(res.body).toEqual([{ id: 1, name: "alice" }]);
        });
    });

    describe("@Use 中间件绑定", () => {
        it("@Use 内联函数：next() 前后即 before/after", async () => {
            const calls: string[] = [];
            @Controller("/api")
            class Ctrl {
                @Use(async (c: any, next: any) => {
                    calls.push("before");
                    await next();
                    calls.push("after:" + c.res.status);
                })
                @Get("/")
                ok() {
                    calls.push("method");
                    return { ok: true };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api");
            expect(res.status).toBe(200);
            expect(calls).toEqual(["before", "method", "after:200"]);
        });

        it("@Use 内联函数可短路（不调用 next）与改写响应", async () => {
            @Controller("/api")
            class Ctrl {
                @Use(async (_c: any, next: any) => {
                    await next();
                })
                @Get("/")
                ok() {
                    return { ok: true };
                }

                @Use(async (c: any) => {
                    return c.json({ blocked: true }, 403);
                })
                @Get("/blocked")
                never() {
                    return { ok: true };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const ok = await fetchJson(r.hono, "GET", "/api");
            expect(ok.body).toEqual({ ok: true });
            const blocked = await fetchJson(r.hono, "GET", "/api/blocked");
            expect(blocked.status).toBe(403);
            expect(blocked.body).toEqual({ blocked: true });
        });

        it("@Use 方法级与类级同时存在时类级先执行", async () => {
            const calls: string[] = [];
            @Controller("/api")
            @Use(async (_c: any, next: any) => {
                calls.push("class");
                await next();
            })
            class Ctrl {
                @Use(async (_c: any, next: any) => {
                    calls.push("method");
                    await next();
                })
                @Get("/")
                ok() {
                    return { ok: true };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api");
            expect(res.status).toBe(200);
            expect(calls).toEqual(["class", "method"]);
        });

        it("@Before/@After：前/后执行且无需调用 next()", async () => {
            const calls: string[] = [];
            @Controller("/api")
            class Ctrl {
                @After(async (c: any) => {
                    calls.push("after:" + c.res.status);
                })
                @Before((c: any) => {
                    calls.push("before:" + c.req.method);
                })
                @Get("/")
                ok() {
                    calls.push("method");
                    return { ok: true };
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api");
            expect(res.status).toBe(200);
            expect(calls).toEqual(["before:GET", "method", "after:200"]);
        });

        it("@After 在 handler 抛异常时仍执行（异常已在洋葱内转为错误响应）", async () => {
            let afterStatus = 0;
            @Controller("/api")
            class Ctrl {
                @After(async (c: any) => {
                    afterStatus = c.res.status;
                })
                @Get("/err")
                fail() {
                    throw new Exception("API_DEMO_ERROR", "出错了", 418);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/err");
            expect(res.status).toBe(418);
            expect(afterStatus).toBe(418);
        });
    });

    describe("异常处理", () => {
        it("抛 Exception 返回 {errorKey, message} + status", async () => {
            @Controller("/api")
            class Ctrl {
                @Get("/err")
                fail() {
                    throw new Exception("API_DEMO_ERROR", "出错了", 418);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/err");
            expect(res.status).toBe(418);
            expect(res.body).toEqual({
                errorKey: "API_DEMO_ERROR",
                message: "出错了",
            });
        });

        it("抛原生 Error 返回 INTERNAL_ERROR + 500", async () => {
            @Controller("/api")
            class Ctrl {
                @Get("/err")
                fail() {
                    throw new Error("boom");
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/err");
            expect(res.status).toBe(500);
            expect(res.body.errorKey).toBe("INTERNAL_ERROR");
            expect(res.body.message).toBe("boom");
        });

        it("@Catched 精确匹配返回对象作为响应体", async () => {
            @Controller("/api")
            class Ctrl {
                @Catched("API_USER_NOT_FOUND")
                handle(err: Exception, ctx: any) {
                    return { handled: true, key: err.errorKey };
                }

                @Get("/u")
                fail() {
                    throw new Exception("API_USER_NOT_FOUND", "missing", 404);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/u");
            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                handled: true,
                key: "API_USER_NOT_FOUND",
            });
        });

        it("@Catched PREFIX_* 通配匹配", async () => {
            @Controller("/api")
            class Ctrl {
                @Catched("API_*")
                handle(err: Exception, ctx: any) {
                    return { caught: "wildcard", key: err.errorKey };
                }

                @Get("/u")
                fail() {
                    throw new Exception("API_ANY_THING", "x", 500);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/u");
            expect(res.body).toEqual({
                caught: "wildcard",
                key: "API_ANY_THING",
            });
        });

        it("@Catched 返回 true 中断链并返回默认错误 JSON", async () => {
            @Controller("/api")
            class Ctrl {
                @Catched("SPECIAL_*")
                handle(err: Exception, ctx: any) {
                    return true;
                }

                @Get("/u")
                fail() {
                    throw new Exception("SPECIAL_KEY", "x", 422);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/u");
            expect(res.status).toBe(422);
            expect(res.body).toEqual({
                errorKey: "SPECIAL_KEY",
                message: "x",
            });
        });

        it("@Catched 返回 false/undefined 继续匹配下一个处理器", async () => {
            @Controller("/api")
            class Ctrl {
                @Catched("NO_MATCH_*")
                first(err: Exception, ctx: any) {
                    return false;
                }

                @Catched("API_*")
                second(err: Exception, ctx: any) {
                    return { who: "second", key: err.errorKey };
                }

                @Get("/u")
                fail() {
                    throw new Exception("API_X", "x", 500);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/u");
            expect(res.body).toEqual({ who: "second", key: "API_X" });
        });

        it("@Catched 不匹配的 errorKey 不触发处理器", async () => {
            @Controller("/api")
            class Ctrl {
                @Catched("OTHER_*")
                handle(err: Exception, ctx: any) {
                    return { handled: true };
                }

                @Get("/u")
                fail() {
                    throw new Exception("API_X", "x", 500);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/u");
            expect(res.status).toBe(500);
            expect(res.body.errorKey).toBe("API_X");
            expect(res.body.handled).toBeUndefined();
        });

        it("精确匹配优先于通配匹配（顺序校验）", async () => {
            // globalHandlers 排序：精确在前，通配在后
            // 但实际匹配是按数组顺序，源码排序后通配置后
            @Controller("/api")
            class Ctrl {
                @Catched("API_*")
                wildcard(err: Exception, ctx: any) {
                    return { who: "wildcard" };
                }

                @Catched("API_USER_NOT_FOUND")
                exact(err: Exception, ctx: any) {
                    return { who: "exact" };
                }

                @Get("/u")
                fail() {
                    throw new Exception("API_USER_NOT_FOUND", "x", 404);
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/api/u");
            // 排序后 exact 在前，应优先命中
            expect(res.body.who).toBe("exact");
        });
    });

    describe("WebSocket 端点", () => {
        it("未注入 upgradeWebSocket 时 WS 控制器路径返回 501", async () => {
            @Controller("/link")
            class Ctrl {
                @Get("/status")
                status() {
                    return { ok: true };
                }
                @OnOpen()
                onOpen() {}
            }
            void Ctrl;

            const cap = captureConsole();
            let res: { status: number; body: any };
            try {
                const r = makeRouter();
                res = await fetchJson(r.hono, "GET", "/link");
            } finally {
                cap.restore();
            }
            expect(res!.status).toBe(501);
            expect(res!.body.errorKey).toBe("WEBSOCKET_NOT_CONFIGURED");
            const warns = cap.logs.warn.map((a) => a.join(" ")).join("\n");
            expect(warns).toContain('no "upgradeWebSocket" adapter');
        });

        it("HTTP 路由不受 WS 端点影响", async () => {
            @Controller("/link")
            class Ctrl {
                @Get("/status")
                status() {
                    return { ok: true };
                }
                @OnOpen()
                onOpen() {}
            }
            void Ctrl;

            const cap = captureConsole();
            let res: { status: number; body: any };
            try {
                const r = makeRouter();
                res = await fetchJson(r.hono, "GET", "/link/status");
            } finally {
                cap.restore();
            }
            expect(res!.status).toBe(200);
            expect(res!.body).toEqual({ ok: true });
            const warns = cap.logs.warn.map((a) => a.join(" ")).join("\n");
            expect(warns).toContain('no "upgradeWebSocket" adapter');
        });
    });

    describe("printRoutes", () => {
        it("printRoutes:true 不抛错（即便无路由也打印 No routes registered）", () => {
            const cap = captureConsole();
            try {
                expect(() => makeRouter(true)).not.toThrow();
            } finally {
                cap.restore();
            }
            const logs = cap.logs.log.map((a) => a.join(" ")).join("\n");
            expect(logs).toContain("No routes registered");
        });

        it("printRoutes:true 有路由时打印表格分隔线与 Total 行", async () => {
            const cap = (() => {
                const logs: string[] = [];
                const orig = console.log;
                console.log = ((...args: unknown[]) => {
                    logs.push(args.join(" "));
                }) as never;
                return {
                    restore: () => {
                        console.log = orig as never;
                    },
                    logs,
                };
            })();

            try {
                @Controller("/user")
                class UserController {
                    @Get("/list")
                    list() {
                        return [];
                    }

                    @Get("/:id")
                    getById() {
                        return {};
                    }
                }
                void UserController;

                makeRouter(true);
            } finally {
                cap.restore();
            }

            const joined = cap.logs.join("\n");
            expect(joined).toContain("+");
            expect(joined).toContain("|");
            expect(joined).toContain("Total: 2 routes");
            expect(joined).toContain("GET");
            expect(joined).toContain("/user/list");
            expect(joined).toContain("UserController.list");
        });
    });

    describe("handler 返回 Response", () => {
        it("handler 返回 Response 时原样输出", async () => {
            @Controller("/w")
            class Ctrl {
                @Get("/file")
                file() {
                    return new Response("bin-data", { status: 202 });
                }
            }
            void Ctrl;

            const r = makeRouter();
            const res = await fetchJson(r.hono, "GET", "/w/file");
            expect(res.status).toBe(202);
            expect(res.body).toBeNull(); // 非 JSON 响应体
        });
    });

    describe("@Use 命名中间件", () => {
        /** 构造带命名中间件解析器的 Router */
        function makeRouterWithResolver(
            registry: Record<
                string,
                (c: any, next: () => Promise<void>) => Promise<void>
            >,
        ): { hono: Hono } {
            const hono = new Hono();
            const router = new Router(hono, false, (name) => registry[name]);
            router.registerRoutes();
            return { hono };
        }

        it("方法级 @Use 启用对应名称的中间件", async () => {
            const trace: string[] = [];
            @Controller("/m")
            class Ctrl {
                @Get("/ok")
                @Use("auth")
                ok() {
                    trace.push("handler");
                    return { ok: 1 };
                }
            }
            void Ctrl;

            const { hono } = makeRouterWithResolver({
                auth: async (_c, next) => {
                    trace.push("enter:auth");
                    await next();
                    trace.push("exit:auth");
                },
            });
            const res = await fetchJson(hono, "GET", "/m/ok");
            expect(res.status).toBe(200);
            expect(trace).toEqual(["enter:auth", "handler", "exit:auth"]);
        });

        it("类级 + 方法级同时存在时类级先执行", async () => {
            const trace: string[] = [];
            @Controller("/m")
            @Use("cls")
            class Ctrl {
                @Get("/ok")
                @Use("mth")
                ok() {
                    return { ok: 1 };
                }
            }
            void Ctrl;

            const mk =
                (tag: string) => async (_c: any, next: () => Promise<void>) => {
                    trace.push(`enter:${tag}`);
                    await next();
                    trace.push(`exit:${tag}`);
                };
            const { hono } = makeRouterWithResolver({
                cls: mk("cls"),
                mth: mk("mth"),
            });
            await fetchJson(hono, "GET", "/m/ok");
            expect(trace).toEqual([
                "enter:cls",
                "enter:mth",
                "exit:mth",
                "exit:cls",
            ]);
        });

        it("未标注 @Use 的路由不经过中间件", async () => {
            const trace: string[] = [];
            @Controller("/m")
            class Ctrl {
                @Get("/plain")
                plain() {
                    return { ok: 1 };
                }
            }
            void Ctrl;

            const { hono } = makeRouterWithResolver({
                auth: async (_c, next) => {
                    trace.push("hit");
                    await next();
                },
            });
            const res = await fetchJson(hono, "GET", "/m/plain");
            expect(res.status).toBe(200);
            expect(trace).toEqual([]);
        });

        it("中间件可短路请求（不调用 next）", async () => {
            @Controller("/m")
            class Ctrl {
                @Get("/ok")
                @Use("guard")
                ok() {
                    return { ok: 1 };
                }
            }
            void Ctrl;

            const { hono } = makeRouterWithResolver({
                guard: async (c, _next) => {
                    return c.json({ errorKey: "DENIED" }, 403);
                },
            });
            const res = await fetchJson(hono, "GET", "/m/ok");
            expect(res.status).toBe(403);
            expect(res.body.errorKey).toBe("DENIED");
        });

        it("引用未注册的名称在路由注册期抛 MIDDLEWARE_NOT_FOUND", async () => {
            @Controller("/m")
            class Ctrl {
                @Get("/ok")
                @Use("missing")
                ok() {
                    return { ok: 1 };
                }
            }
            void Ctrl;

            expect(() => makeRouterWithResolver({})).toThrow(
                '中间件 "missing" 未注册',
            );
        });
    });
});
