# Addon 系统

kirinriki 的扩展载体称为 **Addon**。框架内核保持稳定，鉴权、跨应用通信、文件上传、会话、缓存等能力都以 Addon 形式提供（官方 Addon 独立于框架包，位于仓库 `Addons/` 目录，如 [Session Addon](../../Addons/Session/README.md)）。

## 设计理念

1. **应用相互独立**：子应用之间不直接互访，跨应用协作通过 Addon 的中立存储完成
2. **Addon 拥有命名空间**：Addon 名即配置命名空间，Addon 数据与其他应用天然隔离
3. **生命周期明确**：加载与卸载时机固定、顺序可预期，资源申请与释放成对出现
4. **Addon 可以提供注解**：Addon 模块直接 export 参数注解（如 `@ParamsSession()`），使用方从 Addon 导入即可

## Addon 协议

最小 Addon 只需一个全局唯一的 `name`：

```ts
import type { KirinrikiAddon } from "@vecmat/kirinriki";

const myAddon: KirinrikiAddon = {
    name: "my-addon",
};
```

完整形态：

```ts
import {
    registerConfig,
    type KirinrikiAddon,
    type AddonContext,
} from "@vecmat/kirinriki";

interface MyOptions {
    limit: number;
}

const myAddon: KirinrikiAddon<MyOptions> = {
    /** Addon 名（全局唯一），同时作为配置命名空间 */
    name: "my-addon",
    /** Addon 版本 */
    version: "1.0.0",
    /** Addon 描述 */
    description: "示例 Addon",

    /** 加载钩子：init() 时按注册顺序执行 */
    async onLoad(ctx: AddonContext<MyOptions>) {
        // 注册 Addon 自己的配置项（归属 "my-addon" 命名空间）
        registerConfig(
            [{ key: "my-addon.limit", type: "number", default: 10 }],
            "my-addon",
        );
        const limit = await ctx.config.get("my-addon.limit");
        console.log("limit =", limit, "options =", ctx.options);
    },

    /** 卸载钩子：destroy() 时按加载逆序执行 */
    async onUnload(ctx) {
        // 释放连接、停止定时器等
    },
};
```

## 注册 Addon

两种方式等价，均须在 `init()` 之前：

```ts
// 方式一：链式注册，可携带 Addon 私有 options
app.addon(myAddon, { limit: 20 });

// 方式二：构造选项预注册
const app = new Kirinriki({
    addons: [myAddon],
});
```

注册保护：

| 场景 | 异常 |
|------|------|
| 同名 Addon 重复注册 | `ADDON_DUPLICATED` (409) |
| `init()` 之后注册 | `ADDON_TOO_LATE` (409) |

## 生命周期时序

```
app.init():
    配置中心就绪
      → Addon onLoad（按注册顺序）
      → INIT 生命周期钩子（@OnInit / app.onInit）
      → 路由挂载
      → READY 生命周期钩子

app.destroy():
    DESTROY 生命周期钩子（@OnDestroy / app.onDestroy）
      → Addon onUnload（按加载逆序，后加载的先卸载）
```

要点：

- **onLoad 在路由挂载之前**：Addon 此时可通过 `container.register` 注册 Bean（如 SessionService），注解在请求期从容器解析
- **onLoad 抛错中断 init**：Addon 初始化失败应尽早暴露，不允许带病启动
- **onUnload 抛错仅告警**：不阻断其余 Addon 卸载，保证 destroy 尽量完成资源清理
- **加载顺序即依赖顺序**：Addon A 依赖 Addon B 时，B 先注册；销毁时 B 最后卸载

## Addon 上下文 AddonContext

`onLoad` / `onUnload` 的入参，两次调用收到一致的上下文：

| 字段 | 类型 | 说明 |
|------|------|------|
| `ctx.app` | `Kirinriki` | 宿主应用实例 |
| `ctx.config` | `ScopedConfig` | Addon 私有命名空间配置（owner = Addon 名） |
| `ctx.options` | 注册时传入 | Addon 私有选项，泛型 `KirinrikiAddon<TOptions>` |

### 配置命名空间隔离

Addon 通过 `ctx.config` 只能访问：

- **自己名下的配置项**（`registerConfig(fields, "my-addon")` 注册）
- **主应用全局配置**（注册时未指定 owner）

越权访问其他应用/Addon 的配置会抛 `CONFIG_FORBIDDEN` (403)，访问未注册配置抛 `CONFIG_NOT_REGISTERED` (404)：

```ts
async onLoad(ctx) {
    await ctx.config.get("my-addon.limit");   // ✓ 自己的
    await ctx.config.get("shared.timeout");   // ✓ 全局的
    await ctx.config.get("auth.secret");      // ✗ CONFIG_FORBIDDEN
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
        async (ctx) => ctx.req.header("x-tenant-id") ?? "default",
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
import { sessionAddon, ParamsSession } from "@vecmat/addon-session";

@Controller("/me")
class MeController {
    @Get("/")
    me(@ParamsSession("user") user: unknown) {
        return { user };
    }
}

const app = new Kirinriki({ addons: [sessionAddon] });
await app.init();
```

完整文档（含 API、配置项与 Redis 存储实现示例）见 **[Addons/Session/README.md](../../Addons/Session/README.md)**。

## 完整示例：计数器 Addon

```ts
import { registerConfig, type KirinrikiAddon } from "@vecmat/kirinriki";

export function createCounterAddon(): KirinrikiAddon {
    let count = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    return {
        name: "counter",
        version: "1.0.0",

        async onLoad(ctx) {
            registerConfig(
                [{ key: "counter.interval", type: "number", default: 1000 }],
                "counter",
            );
            const interval = (await ctx.config.get<number>("counter.interval"))!;

            timer = setInterval(() => {
                count++;
                console.log(`[counter] ${count}`);
            }, interval);
        },

        async onUnload() {
            if (timer) clearInterval(timer);
        },
    };
}

// 使用
app.addon(createCounterAddon());
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

### `KirinrikiAddon<TOptions>`

| 成员 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | ✓ | Addon 名，全局唯一，兼作配置命名空间 |
| `version` | `string` | | Addon 版本 |
| `description` | `string` | | Addon 描述 |
| `onLoad` | `(ctx) => void \| Promise<void>` | | 加载钩子，注册序执行 |
| `onUnload` | `(ctx) => void \| Promise<void>` | | 卸载钩子，加载逆序执行 |

### `app.addon(addon, options?)`

注册 Addon，返回 `this` 支持链式调用。须在 `init()` 之前调用。

### 注解复用函数（Addon 作者使用）

| 导出 | 说明 |
|------|------|
| `InjectParams(name, fn, opts?)` | 定义参数注解的基础函数（fn 入参为 Hono Context） |
| `ParamOption` / `ParamDefinition` / `TParams` | 参数注解相关类型 |
| `registerConfig(fields, owner?)` | 注册 Addon 配置项 |
| `container` / `BeanType` / `BeanScope` | 向容器注册服务（onLoad 中使用） |

### `AddonManager`

应用内部持有的 Addon 管理器（`app.addon()` 的底层实现），高级场景可直接使用：

| 成员 | 说明 |
|------|------|
| `size` | 已注册 Addon 数量 |
| `listNames()` | 已注册 Addon 名（按注册顺序） |
| `register(addon, options?)` | 注册 Addon（不触发钩子） |
| `loadAll(app)` | 按注册顺序执行全部 onLoad |
| `unloadAll(app)` | 按加载逆序执行全部 onUnload |
