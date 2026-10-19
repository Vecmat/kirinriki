# Addon 系统

kirinriki 的扩展载体称为 **Addon**。框架内核保持稳定，鉴权、跨应用通信、文件上传、会话、缓存等能力都以 Addon 形式提供（官方 Addon 独立于框架包，位于仓库 `Addons/` 目录，如 [Session Addon](../../Addons/Session/README.md)）。

Addon 是**用注解声明的类**：`@Addon` 声明身份、`@Savant` 声明中间件方法、`@Config` 声明配置项；框架在 `init()` 中**按固定阶段统一处理**全部 Addon。

## 设计理念

1. **应用相互独立**：子应用之间不直接互访，跨应用协作通过 Addon 的中立存储完成
2. **Addon 拥有命名空间**：Addon 名即配置命名空间，Addon 数据与其他应用天然隔离
3. **注解声明、框架编排**：Addon 只声明「是什么」（身份/中间件/配置），不关心「何时做」——加载顺序、配置注入、中间件启用时机由框架统一调度
4. **分阶段生命周期**：先加载所有类 → 统一处理 config → 统一处理中间件 → 执行 onLoad → 注入中间件 → 启动；阶段固定、顺序可预期
5. **容器统一管理**：Addon 类是容器中的 Bean（`BeanType.ADDON`），实例由容器创建（支持 `@Autowired`），所有声明元数据经容器/Reflect 统一登记
6. **Addon 可以提供注解**：Addon 模块直接 export 参数注解（如 `@ParamsSession()`），使用方从 Addon 导入即可

## Addon 协议

最小 Addon 只需一个 `@Addon` 装饰的类：

```ts
import { Addon, type IAddon } from "@vecmat/kirinriki";

@Addon()                        // 省略 name 时按类名推导（去 "Addon" 后缀 + 首字母小写）
class MyAddon implements IAddon {
}
```

完整形态（三种注解各有职责）：

```ts
import { Addon, Savant, Config, type IAddon, type AddonScope } from "@vecmat/kirinriki";
import type { Context } from "hono";

interface MyOptions { limit?: number }

@Addon("my-addon", {
    version: "1.0.0",
    description: "示例 Addon",
})
class MyAddon implements IAddon<MyOptions> {
    /** 属性级 @Config：key 归属本 Addon 命名空间，框架在 config 阶段解析并注入 */
    @Config({ type: "number", default: 10 })
    limit!: number;

    /** @Savant：类方法本身就是中间件（this 为 Addon 实例）；global 时声明即全局启用 */
    @Savant("my-mw", { priority: 50, global: true })
    async mw(c: Context, next: () => Promise<void>) {
        if (this.limit > 0) { /* ... */ }
        await next();
    }

    /** 加载钩子：init() 时按注册顺序执行 */
    async onLoad(scope: AddonScope<MyOptions>) {
        // 注册本 Addon 提供的 Bean（已登记的中间件无需重复注册）
        scope.container.register({ /* ... */ });
        // 也可在钩子中动态启用中间件（名称已在中间件收集阶段登记）
        scope.middleware.use("my-mw", { priority: 50 });
        console.log("limit =", this.limit, "options =", scope.options);
    }

    /** 卸载钩子：destroy() 时按加载逆序执行 */
    async onUnload() {
        // 释放连接、停止定时器等
    }
}
```

三个注解的分工：

| 注解 | 位置 | 职责 |
|------|------|------|
| `@Addon(name?, opts?)` | 类 | 声明 Addon 身份（name/version/description），name 全局唯一且作为配置命名空间 |
| `@Savant(name, opts?)` | 方法 | 声明该**方法**为中间件：`global: true` 声明即全局启用；`factory: true` 声明为**工厂形态**（方法为 `(options?) => MiddlewareHandler`，引用方按参数实例化）；否则仅登记名称供 `@Use` 引用 |
| `@Config(item)` | 类 / 属性 | 声明配置项：属性级自动拼接 key 并**注入属性值**；类级一次声明若干项（须显式 key） |

## 注册 Addon

两种方式等价，均须在 `init()` 之前：

```ts
// 方式一：链式注册，可携带 Addon 私有 options
app.addon(MyAddon, { limit: 20 });

// 方式二：构造选项预注册
const app = new Kirinriki({
    addons: [MyAddon],
});
```

`app.addon` 是泛型的——`addon<T>(clazz: AddonClass<T>, options?: T)`，
`T` 由 Addon 类声明推导，因此 **options 会被类型校验**，`scope.options` 与
`this.options` 也带准确类型：

```ts
class MyAddon implements IAddon<{ limit: number }> { /* ... */ }

app.addon(MyAddon, { limit: 20 });     // ✓ 推导 T = { limit: number }
app.addon(MyAddon, { limitt: 20 });    // ✗ 编译错误：未知属性
app.addon(MyAddon, { limit: "20" });   // ✗ 编译错误：类型不符
```

注册保护：

| 场景 | 异常 |
|------|------|
| 类未使用 `@Addon` 装饰 | `ADDON_NOT_DECORATED` (500) |
| 同名 Addon 重复注册 | `ADDON_DUPLICATED` (409) |
| `init()` 之后注册 | `ADDON_TOO_LATE` (409) |

## 生命周期时序

`init()` 按固定阶段推进，Addon 之间互不干扰：

```
app.init():
    ① 初始化配置中心（stores / env 就绪）
    ② 加载所有类      —— 容器实例化全部 @Addon 类（@Autowired 装配）
    ③ 统一处理 config —— 收集全部 @Config：注册进配置中心 + 注入属性
    ④ 统一处理中间件  —— 收集全部 @Savant：登记名称 + global 进入注入队列
    ⑤ 加载 Addon      —— 按注册顺序执行 onLoad(scope)
    ⑥ 注入中间件      —— 按 priority 降序统一注入 Hono（先于路由注册）
    ⑦ INIT 钩子 → 路由挂载 → READY 钩子

app.destroy():
    DESTROY 生命周期钩子（@OnDestroy / app.onDestroy）
      → Addon onUnload（按加载逆序，后加载的先卸载）
        （每个 Addon 卸载时先摘除其全部中间件与注册名称，再执行 onUnload）
```

要点：

- **onLoad 在路由挂载之前**：Addon 此时可通过 `scope.container.register` 注册 Bean（如 SessionService），注解在请求期从容器解析
- **配置先于 onLoad**：`@Config` 声明的项已注册、属性已注入，onLoad 中 `this.x` 与 `scope.config.get()` 均可直接使用
- **中间件名称先于 onLoad**：`@Savant` 声明的名称已在中间件收集阶段登记，onLoad 中可 `scope.middleware.use("name")`
- **onLoad 抛错中断 init**：Addon 初始化失败应尽早暴露，不允许带病启动
- **onUnload 抛错仅告警**：不阻断其余 Addon 卸载，保证 destroy 尽量完成资源清理
- **加载顺序即依赖顺序**：Addon A 依赖 Addon B 时，B 先注册；销毁时 B 最后卸载
- **init() 幂等/可重试**：重复调用直接返回；中途失败可重试，各阶段自带幂等标记（已加载的 Addon 不重复 onLoad，静态中间件声明不重复登记）
- **中间件卸载摘除**：Hono 不支持反注册，Addon 中间件由唯一的分发洋葱层托管（请求期按存活列表动态执行）；卸载时摘除对应条目，destroy 后不再拦截请求

## 声明中间件

### 方式一：`@Savant` 注解（推荐）

类方法**本身**就是中间件——签名 `(c, next) => Promise<void>`，`this` 为 Addon 实例，
因此可直接读取 `this.options` 与 `@Config` 注入的属性。

```ts
@Addon()
class TraceAddon implements IAddon {
    @Config({ type: "boolean", default: true })
    enabled!: boolean;

    // global: true → 声明即全局启用（priority 决定洋葱层级，越大越外层）
    @Savant("trace", { global: true, priority: 10 })
    async trace(c: Context, next: () => Promise<void>) {
        if (!this.enabled) return next();
        const t0 = Date.now();
        await next();
        console.log("cost", Date.now() - t0);
    }

    // 不给 global → 仅登记名称，onLoad 中按需启用，或由 @Use("auth") 引用
    @Savant("auth")
    async auth(c: Context, next: () => Promise<void>) { /* ... */ }

    // 工厂形态：方法返回中间件，引用方（@Use / scope.middleware.use）按参数实例化
    // 适合需要按使用处配置的中间件（如限流：不同路由不同阈值）
    @Savant("ratelimit", { factory: true })
    ratelimit(options?: { limit?: number }) {
        const limit = options?.limit ?? 1000;
        return async (c: Context, next: () => Promise<void>) => {
            /* 按 limit 限流 ... */ await next();
        };
    }

    onLoad(scope: AddonScope) {
        scope.middleware.use("auth", { priority: 50 });
    }
}
```

### 方式二：`scope.middleware.register`（动态创建）

仅在 onLoad 中**动态创建**中间件（依赖运行时配置/选项）时才需要：

```ts
onLoad(scope: AddonScope) {
    scope.middleware.register("auth-log", async (c, next) => { /* ... */ await next(); });
    // 也可直接启用匿名中间件（不可被 @Use 引用）
    scope.middleware.use(async (c, next) => { /* ... */ await next(); }, { priority: 10 });
    // 启用工厂型中间件时同样可携带 options（按参数实例化）
    scope.middleware.use("ratelimit", { priority: 10, options: { limit: 100 } });
}
```

### 子应用按需引用（`@Use`）

`@Use` 是中间件的统一绑定入口（同时替代了旧版 AOP 的 `@Before/@After/@Around`），
支持**三种引用形式**（类级 + 方法级同时存在时类级先执行）：

```ts
import { Use } from "@vecmat/kirinriki";

@Controller("/admin")
@Use("auth")                  // ① 按名引用：整个控制器启用
class AdminController {
    @Get("/audit")
    @Use("auth-log")          // ① 该方法额外启用
    audit() { return { ok: true }; }

    @Post("/publish")
    @Use(async (c, next) => { /* 前置逻辑 */ await next(); /* 后置逻辑 */ })  // ② 内联函数
    publish() { return { ok: true }; }
}
```

**动态绑定参数（工厂型中间件）**：`@Savant(name, { factory: true })` 把方法声明为
**中间件工厂**——方法签名变为 `(options?) => MiddlewareHandler`，返回的中间件闭包
持有 options 即持有状态；引用处用 `@Use("name", options)` 按需传参，
同一个中间件即可在不同绑定处使用不同配置（如限流：不同路由不同阈值）：

```ts
// 声明侧：工厂形态（Addon 内）
@Addon("limiter")
class LimiterAddon implements IAddon {
    @Savant("ratelimit", { factory: true })
    ratelimit(options?: { limit?: number }): MiddlewareHandler {
        const limit = options?.limit ?? 1000;
        const counter = new Map<string, number>();   // 每个绑定实例独立状态
        return async (c, next) => { /* 按 limit 限流 ... */ await next(); };
    }
}

// 引用侧：同一中间件，不同绑定处不同配置
@Controller("/api")
@Use("ratelimit", { limit: 1000 })        // 类级：1000 次/分钟
class ApiController {
    @Get("/heavy")
    @Use("ratelimit", { limit: 100 })     // 方法级：100 次/分钟
    heavy() { return { ok: true }; }

    @Get("/default")
    @Use("ratelimit")                     // 无参引用：以默认配置（limit=1000）实例化
    normal() { return { ok: true }; }
}
```

实例化与共享规则：

- **相同 `name + options` 组合共享同一个实例**（路由注册期缓存）——
  类级与方法级绑定同配置时计数器天然共享；
  options 为任意对象，键序不影响共享判定（框架按稳定序列化生成缓存键）
- **不同配置各自实例化**：`{ limit: 1000 }` 与 `{ limit: 100 }` 是两个独立实例，状态互不影响
- **全局启用也可带参**：`factory: true` 且声明 `global: true` 时收集阶段以**无参**
  （默认配置）实例化；带参全局启用则在 `onLoad` 中
  `scope.middleware.use("ratelimit", { priority: 10, options: { limit: 100 } })`
- **本体型**（非 factory）中间件被 `@Use(name, options)` 带参引用时 options 被忽略（不报错）

另外两种引用形式：

- 内联函数：`@Use(fn)` 吸收了原 AOP 切面能力——`await next()` 之前的代码即 `@Before`，
  之后的即 `@After`，围绕 `next()` 的包裹即 `@Around`
- 便捷钩子：只需在前/后执行一段逻辑时，用 `@Before(fn)` / `@After(fn)`
  （无需自己调用 `next()`，等价于内联形式的切片写法）；
  `@After` 中可通过 `c.res` 读取或替换响应（异常已在洋葱内转为错误响应，钩子仍会执行）

### 规则

- 名称全局唯一，重复注册抛 `MIDDLEWARE_DUPLICATED` (409)
- `scope.middleware.use` 未登记的名称抛 `MIDDLEWARE_NOT_FOUND` (409)；`@Use` 引用未登记名称在**路由注册期**抛 `MIDDLEWARE_NOT_FOUND` (500)
- `@Savant` 方法本身也是中间件：**不要**再对同一方法做别的用途
- `scope.middleware.use` / `scope.middleware.register` **仅可在 onLoad 中调用**，否则抛 `ADDON_USE_TOO_LATE` (409)
- **卸载自动清理**：`destroy()` 时框架摘除该 Addon 的全部中间件**及其注册的全部名称**（先于 onUnload 执行）
- 同一中间件被全局启用且又被 `@Use` 引用时会**执行两次**，请只用一种方式
- 层级规则：手动 `app.use`（最外层）→ Addon 全局启用（priority 降序，同级按启用顺序）→ 控制器 `@Use`（类级 → 方法级）→ handler

## 声明配置（`@Config`）

`@Config` 把配置项声明交给框架统一收集，归属本 Addon 命名空间（owner 自动绑定，无需写自己的名字）。

**属性级**（key 省略时自动拼接 `"${addonName}.${属性名}"`，解析值注入属性）：

```ts
@Addon("session")
class SessionAddon implements IAddon {
    @Config({ type: "number", default: 3600 })
    ttl!: number;

    onLoad() {
        console.log(this.ttl);   // 已注入解析后的值
    }
}
```

**类级**（一次声明若干项，`key` 必须显式提供）：

```ts
@Addon("cache")
@Config({ key: "cache.driver", type: "string", default: "memory" })
@Config({ key: "cache.ttl", type: "number", default: 60 })
class CacheAddon implements IAddon {}
```

`@Config` 的字段：`key?` / `type`（必填）/ `default?` / `description?`。
读取的值优先级为 **存储层 > 环境变量 > 默认值**。

## Addon 作用域 AddonScope

`onLoad` / `onUnload` 的入参，两次调用收到一致的作用域对象。它是应用在**装载期**暴露给插件的**能力集合（外立面）**，按模块组织（见下表）。

刻意不直接传 `app`：后续新增能力（事件总线、任务调度器等）只需在接口上追加模块字段，不破坏已有 Addon 实现，也避免插件越权访问应用内部。需要管理器时用 `scope.app.addonManager`。命名避开 `ctx`，与请求处理层的 Hono `ctx`/`c` 区分开。

| 字段 | 类型 | 说明 |
|------|------|------|
| `scope.app` | `Kirinriki` | 宿主应用实例（`scope.app.addonManager` 为其 Addon 管理器） |
| `scope.container` | `Container` | IOC 容器：注册/解析 Bean（插件可注册自己提供的服务） |
| `scope.config` | `ScopedConfig` | 配置模块：`get`/`set` 读写本命名空间，`register` 声明配置项（owner 自动绑定，无需写自己的名字） |
| `scope.middleware` | `AddonMiddlewareModule` | 中间件模块：`register` 注册命名中间件、`use` 全局启用 |
| `scope.options` | 注册时传入 | Addon 私有选项，泛型 `AddonClass<TOptions>`；`this.options` 亦可读取 |

**设计意图**：scope 按模块组织应用在装载期提供的能力，插件因此**无需从框架导入任何能力函数**——声明配置用 `scope.config.register`、注册中间件用 `scope.middleware.register`、注册服务用 `scope.container.register`。后续新增子系统（事件总线、任务调度器等）只需在 scope 上追加模块字段，已有 Addon 实现不受影响。

### 配置命名空间隔离

Addon 通过 `scope.config` 读取和声明配置，只能访问：

- **自己名下的配置项**（`@Config` 声明或 `scope.config.register(...)`，owner 自动绑定为 Addon 名）
- **主应用全局配置**（主应用用 `registerConfig(fields)` 声明，无 owner）

越权访问其他应用/Addon 的配置会抛 `CONFIG_FORBIDDEN` (403)，访问未注册配置抛 `CONFIG_NOT_REGISTERED` (404)：

```ts
async onLoad(scope) {
    await scope.config.get("my-addon.limit");   // ✓ 自己的
    await scope.config.get("shared.timeout");   // ✓ 全局的
    await scope.config.get("auth.secret");      // ✗ CONFIG_FORBIDDEN
}
```

## Addon 提供注解

框架从入口导出参数注解复用函数 **`InjectParams`**（配合 `ParamOption`、`TParams` 类型），Addon 在自己的模块里即可定义参数注解并 export：

```ts
// my-addon/params.ts
import { InjectParams } from "@vecmat/kirinriki";

/** 注入当前租户 ID（从请求头解析） */
export const ParamsTenant: () => ParameterDecorator = () =>
    InjectParams(
        "ParamsTenant",
        // 注意：此处的 c 是请求层的 Hono Context，与 Addon 的 scope 不同
        async (c) => c.req.header("x-tenant-id") ?? "default",
        { source: "header" },
    );
```

- 第一个参数（装饰器名）仅用于错误提示定位
- `fn` 在每次请求时调用，入参为 Hono Context
- `opts.source` 为来源标记，供 `@Valid` schema 校验定位使用
- 复杂注解可在 `fn` 内从容器解析 Addon 注册的服务（见下方 Session 实例）

官方实例：**Session Addon**（`@vecmat/addon-session`）的 `@ParamsSession(key?)`——基于 `InjectParams` 实现，请求时从容器解析 `SessionService` 读取会话数据，详见 [Addons/Session](../../Addons/Session/README.md)。

## 官方 Addon：@vecmat/addon-session

Session Addon 与框架分离，独立提供 `@ParamsSession()` 参数注解、`SessionService` 会话服务与可插拔存储（内置内存实现，Redis 等继承 `SessionStore` 注入）。快速上手：

```ts
import { Kirinriki, Controller, Get } from "@vecmat/kirinriki";
import { SessionAddon, ParamsSession } from "@vecmat/addon-session";

@Controller("/me")
class MeController {
    @Get("/")
    me(@ParamsSession("user") user: unknown) {
        return { user };
    }
}

const app = new Kirinriki({ addons: [SessionAddon] });
await app.init();
```

完整文档（含 API、配置项与 Redis 存储实现示例）见 **[Addons/Session/README.md](../../Addons/Session/README.md)**。

## 完整示例：计数器 Addon

```ts
import { Addon, Config, type IAddon, type AddonScope } from "@vecmat/kirinriki";

@Addon("counter")
class CounterAddon implements IAddon {
    /** 属性级 @Config：key 自动为 "counter.interval" */
    @Config({ type: "number", default: 1000 })
    interval!: number;

    private count = 0;
    private timer?: ReturnType<typeof setInterval>;

    onLoad(scope: AddonScope) {
        this.timer = setInterval(() => {
            this.count++;
            console.log(`[counter] ${this.count}`);
        }, this.interval);
    }

    onUnload() {
        if (this.timer) clearInterval(this.timer);
    }
}

// 使用
app.addon(CounterAddon);
await app.init();
// ...
await app.destroy(); // 定时器被清理
```

## Addon 生态规划

官方 Addon 均基于本协议实现，无需改动内核：

| Addon | 能力 |
|-------|------|
| `session` | ✅ [Addons/Session](../../Addons/Session/README.md)：`@ParamsSession()` + SessionService + 可插拔存储 |
| `addon-hub` | 跨应用通信：事件总线 + 命名空间 KV（数据属于 Addon，应用互不感知） |
| `addon-auth` | 鉴权：`@Auth()` / `@Roles()` + JWT 策略 |
| `response` | ✅ [Addons/Response](../../Addons/Response/README.md)：响应统一包装 `{ code, data, message }` + `@Raw()` 跳过 |
| `addon-openapi` | 从路由/zod 元数据生成 Swagger 文档 |
| `addon-upload` | `@UploadedFile()` multipart 封装 |
| `addon-cache` | `@Cacheable()` 声明式缓存 |
| `addon-schedule` | `@Cron` / `@Interval` 任务调度 |

## API 参考

### `IAddon<TOptions>`（Addon 类实现）

| 成员 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `TOptions` | | 注册时传入的私有选项，框架自动赋值（`this.options`） |
| `onLoad` | `(scope) => void \| Promise<void>` | | 加载钩子，注册序执行 |
| `onUnload` | `(scope) => void \| Promise<void>` | | 卸载钩子，加载逆序执行 |

身份与配置由注解声明：`@Addon(name?, { version?, description? })`、`@Savant(name, { priority?, global? })`、`@Config({ key?, type, default?, description? })`。

### `app.addon(clazz, options?)`

注册 Addon 类，返回 `this` 支持链式调用。须在 `init()` 之前调用。

### 注解复用函数（Addon 作者使用）

Addon **声明的配置项、中间件与服务**均通过注解或 `scope` 提供，无需导入能力函数；下列导出主要是**定义注解**时复用框架能力：

| 导出 | 说明 |
|------|------|
| `Addon` / `Savant` / `Config` | Addon 声明注解（身份 / 中间件 / 配置项） |
| `InjectParams(name, fn, opts?)` | 定义参数注解的基础函数（fn 入参为 Hono Context） |
| `ParamOption` / `ParamDefinition` / `TParams` | 参数注解相关类型 |
| `@Use(name \| fn, options?)` | 引用中间件（控制器上使用）：按名 / 带参（工厂型）/ 内联函数三种形式 |
| `registerConfig(fields, owner?)` | 独立注册函数，主要供**主应用**声明全局（无 owner）配置项；Addon 请用 `@Config` / `scope.config.register` |
| `container` / `BeanType` / `BeanScope` | 容器类与枚举；Addon 内注册服务请用 `scope.container` |

### `AddonManager`

应用内部持有的 Addon 管理器（`app.addon()` 的底层实现），高级场景可直接使用：

| 成员 | 说明 |
|------|------|
| `size` | 已注册 Addon 数量 |
| `listNames()` | 已注册 Addon 名（按注册顺序） |
| `register(clazz, options?)` | 登记 Addon 类（同容器登记，不触发钩子） |
| `collectClasses()` | 阶段②：容器实例化全部 Addon 类 |
| `collectConfigs(app)` | 阶段③：收集 `@Config` 注册配置并注入属性 |
| `collectMiddlewares()` | 阶段④：收集 `@Savant` 登记名称 + global 进入注入队列 |
| `loadAll(app)` | 阶段⑤：按注册顺序执行全部 onLoad（跳过已加载记录） |
| `applyMiddleware(hono)` | 阶段⑥：将队列中间件按 priority 降序统一接管（注册唯一分发洋葱层） |
| `resolveMiddleware(name, options?)` | 按名解析已登记中间件（@Use 注解使用；工厂型按 options 实例化）；未登记返回 undefined |
| `unloadAll(app)` | 按加载逆序执行全部 onUnload（每个记录先摘除其全部中间件再执行钩子） |
