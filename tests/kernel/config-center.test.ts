import "reflect-metadata";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    Config,
    ConfigStore,
    MemoryConfigStore,
    FileConfigStore,
    type ConfigExplain,
} from "../../src/kernel/config";
import { configRegistry, registerConfig } from "../../src/core/config-registry";
import { Kirinriki } from "../../src/core/app";
import { App } from "../../src/decorators/app";
import { resetGlobals, withEnv } from "../helpers/reset";

/**
 * 模拟应用侧实现的 Redis 适配：继承 ConfigStore 注入框架。
 * 内部用 Map 模拟 redis 的 get/set 语义（字符串存取）。
 */
class RedisConfigStore extends ConfigStore {
    public data = new Map<string, string>();

    constructor() {
        super("redis");
    }

    async get(key: string): Promise<string | undefined> {
        return this.data.get(key);
    }

    async set(key: string, value: unknown): Promise<void> {
        this.data.set(
            key,
            typeof value === "string" ? value : JSON.stringify(value),
        );
    }

    async delete(key: string): Promise<void> {
        this.data.delete(key);
    }
}

describe("配置中心", () => {
    beforeEach(() => resetGlobals());

    describe("配置项注册与归属", () => {
        it("registerConfig 带 owner 注册", () => {
            registerConfig(
                { key: "auth.tokenTTL", type: "number", default: 3600 },
                "auth",
            );
            expect(configRegistry.has("auth.tokenTTL")).toBe(true);
            expect(configRegistry.ownerOf("auth.tokenTTL")).toBe("auth");
        });

        it("@App({ config }) 自动归属子应用命名空间", () => {
            @App({
                name: "auth",
                basePath: "/auth",
                hash: "h1",
                config: [
                    {
                        key: "auth.issuer",
                        type: "string",
                        default: "kirinriki",
                    },
                ],
            })
            class AuthApp {}
            void AuthApp;

            expect(configRegistry.ownerOf("auth.issuer")).toBe("auth");
        });

        it("不带 owner 的注册为主应用全局配置", () => {
            registerConfig({
                key: "system.name",
                type: "string",
                default: "app",
            });
            expect(configRegistry.ownerOf("system.name")).toBeUndefined();
        });
    });

    describe("实时读写（MemoryConfigStore 默认行为）", () => {
        it("set 后立即 get 可见，无需重载", async () => {
            registerConfig({ key: "flag", type: "boolean", default: false });
            const config = new Config();
            expect(await config.get("flag")).toBe(false);
            await config.set("flag", true);
            expect(await config.get("flag")).toBe(true);
        });

        it("默认值：无来源时生效", async () => {
            registerConfig({
                key: "server.port",
                type: "number",
                default: 3000,
            });
            const config = new Config();
            expect(await config.get<number>("server.port")).toBe(3000);
        });

        it("未注册 key 返回 undefined", async () => {
            const config = new Config();
            expect(await config.get("not.exists")).toBeUndefined();
        });

        it("类型转换：string/number/boolean/json", async () => {
            registerConfig([
                { key: "s", type: "string", default: 123 },
                { key: "n", type: "number", default: "42" },
                { key: "b", type: "boolean", default: "true" },
                { key: "j", type: "json", default: [] },
            ]);
            const restore = withEnv("OPEN_J", '{"a":1}');
            try {
                const config = new Config();
                expect(await config.get("s")).toBe("123");
                expect(await config.get("n")).toBe(42);
                expect(await config.get("b")).toBe(true);
                expect(await config.get("j")).toEqual({ a: 1 });
            } finally {
                restore();
            }
        });

        it("非法 number 回退默认值", async () => {
            registerConfig({ key: "port", type: "number", default: 8080 });
            const restore = withEnv("OPEN_PORT", "not-a-number");
            try {
                const config = new Config();
                expect(await config.get("port")).toBe(8080);
            } finally {
                restore();
            }
        });
    });

    describe("OPEN_ 环境变量（系统级开放配置）", () => {
        it("OPEN_ 前缀实时可见，key 转大写点转下划线", async () => {
            registerConfig({
                key: "auth.tokenTTL",
                type: "number",
                default: 1,
            });
            const restore = withEnv("OPEN_AUTH_TOKENTTL", "7200");
            try {
                const config = new Config();
                expect(await config.get("auth.tokenTTL")).toBe(7200);
            } finally {
                restore();
            }
        });

        it("非 OPEN_ 前缀的环境变量对配置中心不可见", async () => {
            registerConfig({ key: "secret", type: "string", default: "" });
            const restore = withEnv("SECRET", "leaked");
            try {
                const config = new Config();
                expect(await config.get("secret")).toBe("");
            } finally {
                restore();
            }
        });

        it("自定义 envPrefix", async () => {
            registerConfig({ key: "db.host", type: "string", default: "x" });
            const restore = withEnv("MYAPP_DB_HOST", "db.internal");
            try {
                const config = new Config({ envPrefix: "MYAPP_" });
                expect(await config.get("db.host")).toBe("db.internal");
            } finally {
                restore();
            }
        });

        it("env 优先级高于存储层（系统级不可覆盖）", async () => {
            registerConfig({ key: "p", type: "string", default: "default" });
            const redis = new RedisConfigStore();
            redis.data.set("p", "redis");
            const restore = withEnv("OPEN_P", "env");
            try {
                const config = new Config({ stores: [redis] });
                expect(await config.get("p")).toBe("env");
            } finally {
                restore();
            }
        });
    });

    describe("存储层注入（ConfigStore 基类）", () => {
        it("应用实现的 Redis 适配可实时读写", async () => {
            registerConfig({ key: "feature.rate", type: "number", default: 1 });
            const redis = new RedisConfigStore();
            const config = new Config({ stores: [redis] });

            // 从 redis 读（字符串 "5" 按注册类型转 number）
            redis.data.set("feature.rate", "5");
            expect(await config.get("feature.rate")).toBe(5);

            // set 实时写入 redis（writer 默认 stores[0]）
            await config.set("feature.rate", 9);
            expect(redis.data.get("feature.rate")).toBe("9");
            expect(await config.get("feature.rate")).toBe(9);
        });

        it("多存储按注册顺序读取（前者优先）", async () => {
            registerConfig({ key: "src", type: "string", default: "default" });
            const first = new MemoryConfigStore("first");
            const second = new MemoryConfigStore("second");
            await second.set("src", "second");
            const config = new Config({ stores: [first, second] });
            // second 有值但 first 更优先（无值则跳过）
            expect(await config.get("src")).toBe("second");
            await first.set("src", "first");
            expect(await config.get("src")).toBe("first");
        });

        it("指定 writer 时 set 写入指定存储", async () => {
            registerConfig({ key: "k", type: "string", default: "" });
            const readOnly = new MemoryConfigStore("ro");
            const writer = new MemoryConfigStore("rw");
            const config = new Config({
                stores: [readOnly, writer],
                writer,
            });
            await config.set("k", "v");
            expect((await writer.get("k")) === "v").toBe(true);
            expect(await readOnly.get("k")).toBeUndefined();
        });
    });

    describe("FileConfigStore（内置文件存储）", () => {
        it("实时读文件：外部修改立即可见", async () => {
            registerConfig({ key: "db.host", type: "string", default: "" });
            const dir = await mkdtemp(join(tmpdir(), "kirinriki-cfg-"));
            const file = join(dir, "config.json");
            await writeFile(file, JSON.stringify({ db: { host: "v1" } }));

            const store = new FileConfigStore(file);
            const config = new Config({ stores: [store] });
            expect(await config.get("db.host")).toBe("v1");

            // 模拟外部进程修改文件（不做任何框架内 set）
            await writeFile(file, JSON.stringify({ db: { host: "v2" } }));
            expect(await config.get("db.host")).toBe("v2");
            await rm(dir, { recursive: true, force: true });
        });

        it("set 即时落盘，嵌套与字面点路径 key 均支持", async () => {
            registerConfig([
                { key: "a.b", type: "string", default: "" },
                { key: "x.y", type: "number", default: 0 },
            ]);
            const dir = await mkdtemp(join(tmpdir(), "kirinriki-cfg-"));
            const file = join(dir, "config.json");
            const config = new Config({ stores: [new FileConfigStore(file)] });

            await config.set("a.b", "nested");
            await config.set("x.y", 7);
            // 落盘验证：直接读文件
            const onDisk = JSON.parse(await readFile(file, "utf8"));
            expect(onDisk).toEqual({ a: { b: "nested" }, x: { y: 7 } });
            await rm(dir, { recursive: true, force: true });
        });

        it("文件不存在时读为空、写自动创建", async () => {
            registerConfig({ key: "k", type: "string", default: "def" });
            const dir = await mkdtemp(join(tmpdir(), "kirinriki-cfg-"));
            const file = join(dir, "new.json");
            const config = new Config({ stores: [new FileConfigStore(file)] });

            expect(await config.get("k")).toBe("def");
            await config.set("k", "created");
            const onDisk = JSON.parse(await readFile(file, "utf8"));
            expect(onDisk.k).toBe("created");
            await rm(dir, { recursive: true, force: true });
        });
    });

    describe("命名空间隔离（scope）", () => {
        it("应用可读写自己的配置项", async () => {
            registerConfig(
                { key: "auth.tokenTTL", type: "number", default: 3600 },
                "auth",
            );
            const config = new Config();
            const auth = config.scope("auth");
            expect(await auth.get("auth.tokenTTL")).toBe(3600);
            await auth.set("auth.tokenTTL", 60);
            expect(await auth.get("auth.tokenTTL")).toBe(60);
        });

        it("跨应用访问抛 CONFIG_FORBIDDEN", async () => {
            registerConfig(
                { key: "auth.secret", type: "string", default: "s" },
                "auth",
            );
            const config = new Config();
            const user = config.scope("user");
            await expect(user.get("auth.secret")).rejects.toMatchObject({
                errorKey: "CONFIG_FORBIDDEN",
                status: 403,
            });
            await expect(user.set("auth.secret", "x")).rejects.toMatchObject({
                errorKey: "CONFIG_FORBIDDEN",
            });
        });

        it("未注册配置项抛 CONFIG_NOT_REGISTERED", async () => {
            const config = new Config();
            const auth = config.scope("auth");
            await expect(auth.get("auth.unknown")).rejects.toMatchObject({
                errorKey: "CONFIG_NOT_REGISTERED",
                status: 404,
            });
        });

        it("主应用全局配置（无 owner）所有命名空间可读", async () => {
            registerConfig({
                key: "shared.timeout",
                type: "number",
                default: 30,
            });
            const config = new Config();
            expect(await config.scope("auth").get("shared.timeout")).toBe(30);
            expect(await config.scope("user").get("shared.timeout")).toBe(30);
        });

        it("主应用本身不受命名空间限制", async () => {
            registerConfig(
                { key: "auth.secret", type: "string", default: "s" },
                "auth",
            );
            const config = new Config();
            // 主应用直接 get/set 全部配置（统一管理）
            expect(await config.get("auth.secret")).toBe("s");
            await config.set("auth.secret", "changed");
            expect(await config.get("auth.secret")).toBe("changed");
        });

        it("同名命名空间复用同一访问器", () => {
            const config = new Config();
            expect(config.scope("auth")).toBe(config.scope("auth"));
        });
    });

    describe("诊断（explain / list）", () => {
        it("explain 展示各层取值与生效来源", async () => {
            registerConfig({ key: "p", type: "number", default: 1 }, "auth");
            const redis = new RedisConfigStore();
            redis.data.set("p", "5");
            const restore = withEnv("OPEN_P", "3");
            try {
                const config = new Config({ stores: [redis] });
                const info: ConfigExplain = await config.explain("p");
                expect(info.value).toBe(3);
                expect(info.source).toBe("env");
                expect(info.owner).toBe("auth");
                expect(info.layers.env).toBe("3");
                expect(info.layers.stores).toEqual([
                    { store: "redis", value: "5" },
                ]);
                expect(info.layers.default).toBe(1);
            } finally {
                restore();
            }
        });

        it("explain 未注册 key 来源为 none", async () => {
            const config = new Config();
            const info = await config.explain("ghost");
            expect(info.source).toBe("none");
            expect(info.value).toBeUndefined();
            expect(info.schema).toBeUndefined();
        });

        it("list 返回全部注册项及实时生效值与来源", async () => {
            registerConfig({ key: "a", type: "string", default: "da" });
            registerConfig({ key: "b", type: "number", default: 2 }, "auth");
            const restore = withEnv("OPEN_B", "99");
            try {
                const config = new Config();
                const list = await config.list();
                expect(list).toHaveLength(2);
                const a = list.find((x) => x.field.key === "a")!;
                const b = list.find((x) => x.field.key === "b")!;
                expect([a.value, a.source]).toEqual(["da", "default"]);
                expect([b.value, b.source]).toEqual([99, "env"]);
            } finally {
                restore();
            }
        });
    });

    describe("与 Kirinriki 应用集成", () => {
        it("init() 注入存储，app.config 统一管理", async () => {
            @App({
                name: "auth",
                basePath: "/auth",
                hash: "h2",
                config: [
                    {
                        key: "auth.issuer",
                        type: "string",
                        default: "kirinriki",
                    },
                ],
            })
            class AuthApp {}
            void AuthApp;

            const redis = new RedisConfigStore();
            redis.data.set("auth.issuer", "remote-issuer");
            const app = new Kirinriki({
                silent: true,
                config: { stores: [redis] },
            });
            await app.init();

            expect(await app.config.get("auth.issuer")).toBe("remote-issuer");
            await app.config.set("auth.issuer", "main-app");
            expect(await app.config.get("auth.issuer")).toBe("main-app");
            // 字符串值原样存储（应用自己的适配器决定序列化格式）
            expect(redis.data.get("auth.issuer")).toBe("main-app");
        });

        it("子应用通过 scope 访问自己的配置", async () => {
            registerConfig(
                { key: "auth.maxAge", type: "number", default: 60 },
                "auth",
            );
            const app = new Kirinriki({ silent: true });
            await app.init();

            const auth = app.config.scope("auth");
            expect(await auth.get("auth.maxAge")).toBe(60);
        });

        it("配置在 INIT 生命周期钩子前可用", async () => {
            registerConfig({
                key: "boot.flag",
                type: "string",
                default: "ready",
            });
            let seen: unknown;
            const app = new Kirinriki({ silent: true });
            app.onInit(async () => {
                seen = await app.config.get("boot.flag");
            });
            await app.init();
            expect(seen).toBe("ready");
        });
    });
});
