import {
    configRegistry,
    type ConfigField,
    type RegisteredConfigField,
} from "../core/config-registry";
import { Exception } from "../core/exception";

/** 配置来源标识（explain 诊断用）：env / 存储名 / default / none */
export type ConfigSource = "env" | "default" | "none" | string;

/** 配置值诊断结果 */
export interface ConfigExplain {
    key: string;
    /** 配置项声明（未注册则为 undefined） */
    schema?: ConfigField;
    /** 归属命名空间（undefined 表示主应用全局） */
    owner?: string;
    /** 最终生效值 */
    value: unknown;
    /** 生效来源：环境变量 / 存储名 / default / none */
    source: ConfigSource;
    /** 各层原始取值 */
    layers: {
        env?: unknown;
        stores: Array<{ store: string; value: unknown }>;
        default?: unknown;
    };
}

/**
 * 配置存储基类：配置值的外部存储抽象。
 *
 * 框架内置 {@link MemoryConfigStore}（进程内存）与 {@link FileConfigStore}
 * （JSON 文件）；Redis / 数据库 / 远程 KV 等 由具体应用或插件继承本类实现，
 * 然后注入应用实例：
 *
 * ```ts
 * class RedisConfigStore extends ConfigStore {
 *     constructor(private client: Redis) { super("redis"); }
 *     async get(key: string) { ... }
 *     async set(key: string, value: unknown) { ... }
 *     async delete(key: string) { ... }
 * }
 *
 * const app = new Kirinriki({
 *     config: { stores: [new RedisConfigStore(client)] },
 * });
 * ```
 *
 * 约定：get/set/delete 每次调用都直接读写底层存储（实时语义），
 * 是否内部缓存由实现自行决定，框架层不做快照。
 */
export abstract class ConfigStore {
    /** 存储名称（诊断与日志展示用） */
    public readonly name: string;

    constructor(name = "store") {
        this.name = name;
    }

    /** 读取指定 key 的原始值；不存在返回 undefined */
    abstract get(key: string): Promise<unknown | undefined>;

    /** 写入指定 key 的值（实时持久化由实现负责） */
    abstract set(key: string, value: unknown): Promise<void>;

    /** 删除指定 key */
    abstract delete(key: string): Promise<void>;
}

/** 进程内存存储（默认写入目标；无外部存储时的实时 KV 兜底） */
export class MemoryConfigStore extends ConfigStore {
    private map = new Map<string, unknown>();

    constructor(name = "memory") {
        super(name);
    }

    async get(key: string): Promise<unknown | undefined> {
        return this.map.has(key) ? this.map.get(key) : undefined;
    }

    async set(key: string, value: unknown): Promise<void> {
        this.map.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.map.delete(key);
    }
}

/**
 * JSON 文件存储：每次读取实时读文件，写入即时落盘。
 * 支持 嵌套对象 与 点路径字面 key 两种形式。
 */
export class FileConfigStore extends ConfigStore {
    constructor(
        private path: string,
        name = "file",
    ) {
        super(name);
    }

    async get(key: string): Promise<unknown | undefined> {
        const data = await this.readAll();
        return pickPath(data, key);
    }

    async set(key: string, value: unknown): Promise<void> {
        const data = await this.readAll();
        setPath(data, key, value);
        await this.writeAll(data);
    }

    async delete(key: string): Promise<void> {
        const data = await this.readAll();
        if (deletePath(data, key)) {
            await this.writeAll(data);
        }
    }

    /** 读取并解析 JSON 文件；文件不存在静默返回空对象，解析失败仅告警 */
    private async readAll(): Promise<Record<string, unknown>> {
        let text: string;
        try {
            const deno = (globalThis as any).Deno;
            if (deno?.readTextFile) {
                text = await deno.readTextFile(this.path);
            } else {
                const fs = await import("node:fs/promises");
                text = await fs.readFile(this.path, "utf8");
            }
        } catch (err: any) {
            // 文件不存在属正常情况（首次写入前），静默处理
            if (err?.code === "ENOENT" || err?.name === "NotFound") return {};
            console.warn(
                `[Kirinriki] Failed to read config file "${this.path}": ${err?.message || err}`,
            );
            return {};
        }
        try {
            const data = JSON.parse(text);
            return typeof data === "object" && data !== null ? data : {};
        } catch (err: any) {
            console.warn(
                `[Kirinriki] Failed to parse config file "${this.path}": ${err?.message || err}`,
            );
            return {};
        }
    }

    private async writeAll(data: Record<string, unknown>): Promise<void> {
        const text = JSON.stringify(data, null, 4);
        const deno = (globalThis as any).Deno;
        if (deno?.writeTextFile) {
            await deno.writeTextFile(this.path, text);
        } else {
            const fs = await import("node:fs/promises");
            await fs.writeFile(this.path, text, "utf8");
        }
    }
}

/** 点路径取值：先查字面 key，再按 "." 逐层取嵌套值 */
function pickPath(
    data: Record<string, unknown>,
    key: string,
): unknown | undefined {
    if (key in data) return data[key];
    let node: any = data;
    for (const part of key.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
            return undefined;
        }
        node = node[part];
    }
    return node;
}

/** 点路径赋值：字面 key 优先，否则按 "." 逐层写入嵌套对象 */
function setPath(
    data: Record<string, unknown>,
    key: string,
    value: unknown,
): void {
    if (key in data) {
        data[key] = value;
        return;
    }
    const parts = key.split(".");
    let node: any = data;
    for (let i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) {
            node[parts[i]] = {};
        }
        node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
}

/** 点路径删除：存在字面 key 或嵌套路径时删除并返回 true */
function deletePath(data: Record<string, unknown>, key: string): boolean {
    if (key in data) {
        delete data[key];
        return true;
    }
    const parts = key.split(".");
    let node: any = data;
    for (let i = 0; i < parts.length - 1; i++) {
        if (node === null || typeof node !== "object" || !(parts[i] in node)) {
            return false;
        }
        node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (node !== null && typeof node === "object" && last in node) {
        delete node[last];
        return true;
    }
    return false;
}

/** 应用配置选项（由主应用在 `new Kirinriki({ config })` 中统一提供） */
export interface ConfigOptions {
    /**
     * 开放环境变量前缀，默认 "OPEN_"。
     * 只有此前缀的环境变量（如 OPEN_SERVER_PORT）被视为系统级开放配置，
     * 只读、不可被存储层覆盖；其余环境变量对配置中心不可见。
     */
    envPrefix?: string;
    /**
     * 配置存储列表，按数组顺序作为读取优先级（前者优先）。
     * Redis/KV 等由应用或插件继承 ConfigStore 实现后注入。
     */
    stores?: ConfigStore[];
    /** 写入目标存储（config.set 的落点），默认 stores[0]，未提供时为进程内存 */
    writer?: ConfigStore;
}

/**
 * 命名空间受限的配置访问器（应用/插件视角）。
 *
 * 只能访问自己名下（owner 与命名空间一致）或主应用全局（无 owner）的
 * 已注册配置项；访问他人配置抛 CONFIG_FORBIDDEN，
 * 访问未注册配置抛 CONFIG_NOT_REGISTERED。
 */
export class ScopedConfig {
    constructor(
        private config: Config,
        /** 命名空间（应用名/插件名） */
        public readonly owner: string,
    ) {}

    /** 校验 key 归属：未注册或他人命名空间均抛异常 */
    private assert(key: string): RegisteredConfigField {
        const field = configRegistry.get(key);
        if (!field) {
            throw new Exception(
                "CONFIG_NOT_REGISTERED",
                `配置项 "${key}" 未注册，请先通过 registerConfig/@App({ config }) 声明`,
                404,
            );
        }
        if (field.owner && field.owner !== this.owner) {
            throw new Exception(
                "CONFIG_FORBIDDEN",
                `命名空间 "${this.owner}" 无权访问 "${field.owner}" 的配置项 "${key}"`,
                403,
            );
        }
        return field;
    }

    /** 读取本命名空间（或全局）配置项 */
    async get<T = unknown>(key: string): Promise<T | undefined> {
        this.assert(key);
        return this.config.get<T>(key);
    }

    /** 修改本命名空间配置项（写入主应用指定的 writer 存储） */
    async set(key: string, value: unknown): Promise<void> {
        this.assert(key);
        await this.config.set(key, value);
    }
}

/**
 * 框架级配置服务（配置中心）。
 *
 * 分层模型：
 * - **环境变量（OPEN_ 前缀）**：系统级开放配置，只读、最高优先级、每次实时读取；
 *   其余环境变量对配置中心不可见（应用间隔离）
 * - **存储层（ConfigStore）**：文件 / KV 数据库 / Redis 等，由主应用注入，
 *   按注册顺序读取（前者优先），读写全部实时
 * - **注册默认值**：子应用/插件声明配置项时提供
 *
 * 归属与隔离：配置项归属注册它的应用/插件（owner）；
 * 主应用通过本类直接 get/set 统一管理全部配置；
 * 子应用/插件通过 `scope(name)` 拿到受限访问器，越权即抛异常。
 *
 * 保留的 getString/getNumber/getBoolean 为框架内部低级 env 读取
 * （如 KIRINRIKI_PRINT_ROUTES），不属于配置中心体系。
 */
export class Config {
    private envPrefix = "OPEN_";
    private stores: ConfigStore[] = [];
    private writer!: ConfigStore;
    private memory = new MemoryConfigStore("memory");
    private scopedMap = new Map<string, ScopedConfig>();
    private inited = false;

    /**
     * @param options 配置选项；传入即完成初始化。
     * 容器实例化（无参构造）时跳过，由 `Kirinriki.init()` 统一调用 init()。
     */
    constructor(options?: ConfigOptions) {
        if (options) this.init(options);
    }

    /** 注册配置项（等价 registerConfig，便于通过 Config Bean 操作） */
    register(fields: ConfigField | ConfigField[], owner?: string): void {
        configRegistry.register(fields, owner);
    }

    /**
     * 初始化配置来源（由 `Kirinriki.init()` 自动调用，幂等）。
     * 未提供 stores 时使用进程内存存储兜底（读写仍为实时语义）。
     */
    init(options: ConfigOptions = {}): this {
        this.envPrefix = options.envPrefix ?? "OPEN_";
        this.stores =
            options.stores && options.stores.length > 0
                ? options.stores
                : [this.memory];
        this.writer = options.writer ?? this.stores[0];
        this.inited = true;
        return this;
    }

    /** 确保已初始化（允许未 init 直接使用，等价默认配置） */
    private ensureInited(): void {
        if (!this.inited) this.init();
    }

    /**
     * 读取配置项（实时）：OPEN_ 环境变量 > 存储层（按注册顺序）> 注册默认值。
     * 值按注册类型转换；未注册 key 返回 undefined。
     */
    async get<T = unknown>(key: string): Promise<T | undefined> {
        this.ensureInited();
        const { value } = await this.resolve(key);
        return value as T | undefined;
    }

    /**
     * 修改配置项（实时写入 writer 存储并持久化，由存储实现负责落盘）。
     * 主应用统一管理的入口；子应用/插件应使用 scope() 的受限写入。
     */
    async set(key: string, value: unknown): Promise<void> {
        this.ensureInited();
        await this.writer.set(key, value);
    }

    /** 删除 writer 存储中的配置项（实时） */
    async delete(key: string): Promise<void> {
        this.ensureInited();
        await this.writer.delete(key);
    }

    /**
     * 获取指定命名空间的受限访问器（应用/插件视角）。
     * 同名命名空间复用同一实例。
     */
    scope(owner: string): ScopedConfig {
        let scoped = this.scopedMap.get(owner);
        if (!scoped) {
            scoped = new ScopedConfig(this, owner);
            this.scopedMap.set(owner, scoped);
        }
        return scoped;
    }

    /** 列出全部已注册配置项及其实时生效值与来源（统一管理界面数据） */
    async list(): Promise<
        Array<{
            field: RegisteredConfigField;
            value: unknown;
            source: ConfigSource;
        }>
    > {
        const result = [];
        for (const field of configRegistry.list()) {
            const { value, source } = await this.resolve(field.key);
            result.push({ field, value, source });
        }
        return result;
    }

    /** 诊断单个配置项：展示各层取值与最终生效结果（探测全部存储层） */
    async explain(key: string): Promise<ConfigExplain> {
        const field = configRegistry.get(key);
        const { value, source, env, storeHits } = await this.resolve(key, true);
        return {
            key,
            schema: field,
            owner: field?.owner,
            value,
            source,
            layers: {
                env,
                stores: storeHits,
                default: field?.default,
            },
        };
    }

    // ================================================================
    // 内部实现
    // ================================================================

    /**
     * 实时解析：OPEN_ env > stores（按序首个命中）> default。
     * @param probeAll true 时探测全部存储层（explain 诊断用），
     *                 false 时命中即短路（常规读取，减少 IO）
     */
    private async resolve(
        key: string,
        probeAll = false,
    ): Promise<{
        value: unknown;
        source: ConfigSource;
        env?: unknown;
        storeHits: Array<{ store: string; value: unknown }>;
    }> {
        const field = configRegistry.get(key);
        const envValue = this.readEnv()[this.toEnvKey(key)];
        const storeHits: Array<{ store: string; value: unknown }> = [];
        let storeHit: { value: unknown; source: string } | undefined;
        for (const store of this.stores) {
            const v = await store.get(key);
            storeHits.push({ store: store.name, value: v });
            if (v !== undefined && !storeHit) {
                storeHit = { value: v, source: store.name };
            }
            if (storeHit && !probeAll) break;
        }
        if (envValue !== undefined) {
            return {
                value: this.convert(envValue, field),
                source: "env",
                env: envValue,
                storeHits,
            };
        }
        if (storeHit) {
            return {
                value: this.convert(storeHit.value, field),
                source: storeHit.source,
                env: envValue,
                storeHits,
            };
        }
        if (field?.default !== undefined) {
            return {
                value: this.convert(field.default, field),
                source: "default",
                env: envValue,
                storeHits,
            };
        }
        return { value: undefined, source: "none", env: envValue, storeHits };
    }

    /** 按注册的 type 转换值；无 schema 时原样返回 */
    private convert(raw: unknown, schema?: ConfigField): unknown {
        if (raw === undefined || !schema) return raw;
        switch (schema.type) {
            case "string":
                return typeof raw === "string" ? raw : String(raw);
            case "number": {
                const n = typeof raw === "number" ? raw : Number(raw);
                return Number.isFinite(n) ? n : schema.default;
            }
            case "boolean": {
                if (typeof raw === "boolean") return raw;
                const s = String(raw).toLowerCase();
                return s === "true" || s === "1" || s === "yes";
            }
            case "json": {
                if (typeof raw !== "string") return raw;
                try {
                    return JSON.parse(raw);
                } catch {
                    return schema.default;
                }
            }
        }
    }

    /** 配置 key 转开放环境变量名：前缀 + 大写 + "." / "-" → "_" */
    private toEnvKey(key: string): string {
        return `${this.envPrefix}${key.replace(/[.\-]/g, "_").toUpperCase()}`;
    }

    /** 跨运行时读取环境变量表 */
    private readEnv(): Record<string, string> {
        return (
            (globalThis as any).process?.env ||
            (globalThis as any).Deno?.env?.toObject?.() ||
            {}
        );
    }

    // ================================================================
    // 低级环境变量读取（框架内部使用，不属于配置中心体系）
    // ================================================================

    /**
     * 获取字符串配置（直接读 env，精确 key）。
     * @param key 配置键名
     * @param defaultValue 缺省时的默认值
     */
    getString(key: string, defaultValue = ""): string {
        const env = this.readEnv();
        return env[key] ?? defaultValue;
    }

    /** 获取数值配置，解析失败返回默认值 */
    getNumber(key: string, defaultValue = 0): number {
        const raw = this.getString(key);
        const n = Number(raw);
        return Number.isFinite(n) ? n : defaultValue;
    }

    /** 获取布尔配置（"true"/"1" 视为 true） */
    getBoolean(key: string, defaultValue = false): boolean {
        const raw = this.getString(key).toLowerCase();
        if (raw === "") return defaultValue;
        return raw === "true" || raw === "1" || raw === "yes";
    }
}
