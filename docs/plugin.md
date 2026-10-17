# 插件系统

kirinriki 的插件是扩展应用能力的标准载体。框架内核保持稳定，鉴权、跨应用通信、文件上传、缓存等能力都以插件形式提供。

## 设计理念

1. **应用相互独立**：子应用之间不直接互访，跨应用协作通过插件的中立存储完成
2. **插件拥有命名空间**：插件名即配置命名空间，插件数据与其他应用天然隔离
3. **生命周期明确**：加载与卸载时机固定、顺序可预期，资源申请与释放成对出现

## 插件协议

最小插件只需一个全局唯一的 `name`：

```ts
import type { KirinrikiPlugin } from "@vecmat/kirinriki";

const myPlugin: KirinrikiPlugin = {
    name: "my-plugin",
};
```

完整形态：

```ts
import { registerConfig, type KirinrikiPlugin, type PluginContext } from "@vecmat/kirinriki";

interface MyOptions {
    limit: number;
}

const myPlugin: KirinrikiPlugin<MyOptions> = {
    /** 插件名（全局唯一），同时作为配置命名空间 */
    name: "my-plugin",
    /** 插件版本 */
    version: "1.0.0",
    /** 插件描述 */
    description: "示例插件",

    /** 加载钩子：init() 时按注册顺序执行 */
    async onLoad(ctx: PluginContext<MyOptions>) {
        // 注册插件自己的配置项（归属 "my-plugin" 命名空间）
        registerConfig(
            [{ key: "my-plugin.limit", type: "number", default: 10 }],
            "my-plugin",
        );
        const limit = await ctx.config.get("my-plugin.limit");
        console.log("limit =", limit, "options =", ctx.options);
    },

    /** 卸载钩子：destroy() 时按加载逆序执行 */
    async onUnload(ctx) {
        // 释放连接、停止定时器等
    },
};
```

## 注册插件

两种方式等价，均须在 `init()` 之前：

```ts
// 方式一：链式注册，可携带插件私有 options
app.plugin(myPlugin, { limit: 20 });

// 方式二：构造选项预注册
const app = new Kirinriki({
    plugins: [myPlugin],
});
```

注册保护：

| 场景 | 异常 |
|------|------|
| 同名插件重复注册 | `PLUGIN_DUPLICATED` (409) |
| `init()` 之后注册 | `PLUGIN_TOO_LATE` (409) |

## 生命周期时序

```
app.init():
    配置中心就绪
      → 插件 onLoad（按注册顺序）
      → INIT 生命周期钩子（@OnInit / app.onInit）
      → 路由挂载
      → READY 生命周期钩子

app.destroy():
    DESTROY 生命周期钩子（@OnDestroy / app.onDestroy）
      → 插件 onUnload（按加载逆序，后加载的先卸载）
```

要点：

- **onLoad 在路由挂载之前**：插件此时可注册配置项、Bean，甚至控制器，路由会正常收录
- **onLoad 抛错中断 init**：插件初始化失败应尽早暴露，不允许带病启动
- **onUnload 抛错仅告警**：不阻断其余插件卸载，保证 destroy 尽量完成资源清理
- **加载顺序即依赖顺序**：插件 A 依赖插件 B 时，B 先注册；销毁时 B 最后卸载

## 插件上下文 PluginContext

`onLoad` / `onUnload` 的入参，两次调用收到一致的上下文：

| 字段 | 类型 | 说明 |
|------|------|------|
| `ctx.app` | `Kirinriki` | 宿主应用实例 |
| `ctx.config` | `ScopedConfig` | 插件私有命名空间配置（owner = 插件名） |
| `ctx.options` | 注册时传入 | 插件私有选项，泛型 `KirinrikiPlugin<TOptions>` |

### 配置命名空间隔离

插件通过 `ctx.config` 只能访问：

- **自己名下的配置项**（`registerConfig(fields, "my-plugin")` 注册）
- **主应用全局配置**（注册时未指定 owner）

越权访问其他应用/插件的配置会抛 `CONFIG_FORBIDDEN` (403)，访问未注册配置抛 `CONFIG_NOT_REGISTERED` (404)：

```ts
async onLoad(ctx) {
    await ctx.config.get("my-plugin.limit");   // ✓ 自己的
    await ctx.config.get("shared.timeout");    // ✓ 全局的
    await ctx.config.get("auth.secret");       // ✗ CONFIG_FORBIDDEN
}
```

## 完整示例：计数器插件

```ts
import { registerConfig, type KirinrikiPlugin } from "@vecmat/kirinriki";

export function createCounterPlugin(): KirinrikiPlugin {
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
app.plugin(createCounterPlugin());
await app.init();
// ...
await app.destroy(); // 定时器被清理
```

## 插件生态规划

官方插件均基于本协议实现，无需改动内核：

| 插件 | 能力 |
|------|------|
| `plugin-hub` | 跨应用通信：事件总线 + 命名空间 KV（数据属于插件，应用互不感知） |
| `plugin-auth` | 鉴权：`@Auth()` / `@Roles()` + JWT 策略 |
| `plugin-response` | 响应统一包装 `{ code, data, message }` |
| `plugin-openapi` | 从路由/zod 元数据生成 Swagger 文档 |
| `plugin-upload` | `@UploadedFile()` multipart 封装 |
| `plugin-cache` | `@Cacheable()` 声明式缓存 |
| `plugin-schedule` | `@Cron` / `@Interval` 任务调度 |

## API 参考

### `KirinrikiPlugin<TOptions>`

| 成员 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | ✓ | 插件名，全局唯一，兼作配置命名空间 |
| `version` | `string` | | 插件版本 |
| `description` | `string` | | 插件描述 |
| `onLoad` | `(ctx) => void \| Promise<void>` | | 加载钩子，注册序执行 |
| `onUnload` | `(ctx) => void \| Promise<void>` | | 卸载钩子，加载逆序执行 |

### `app.plugin(plugin, options?)`

注册插件，返回 `this` 支持链式调用。须在 `init()` 之前调用。

### `PluginManager`

应用内部持有的插件管理器（`app.plugin()` 的底层实现），高级场景可直接使用：

| 成员 | 说明 |
|------|------|
| `size` | 已注册插件数量 |
| `listNames()` | 已注册插件名（按注册顺序） |
| `register(plugin, options?)` | 注册插件（不触发钩子） |
| `loadAll(app)` | 按注册顺序执行全部 onLoad |
| `unloadAll(app)` | 按加载逆序执行全部 onUnload |
