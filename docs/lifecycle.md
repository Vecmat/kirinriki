# 生命周期

kirinriki 应用的生命周期分为 **INIT → READY → DESTROY** 三个阶段，每个阶段可通过两种方式挂载钩子：Bean 方法装饰器、应用函数钩子。钩子的入参均为应用实例，全部串行 `await` 执行。

## 完整时序

```
app.init():
    配置中心就绪
      → Addon onLoad（按注册顺序）
      → INIT 钩子      ← @OnInit / app.onInit
      → 路由挂载
      → READY 钩子     ← @OnReady / app.onReady

app.destroy():
    DESTROY 钩子       ← @OnDestroy / app.onDestroy
      → Addon onUnload（按加载逆序）
```

同一阶段内的执行顺序：

1. Bean 方法钩子（`@OnInit` 等），按 **Bean 注册顺序**
2. 函数钩子（`app.onInit` 等），按 **注册顺序**

任一钩子抛错会中断后续钩子并向上抛出（INIT 阶段失败即启动失败）。

## 方式一：Bean 方法装饰器

标记在任意 Bean（`@Component` / `@Service` / `@Controller` 等）的方法上，应用进入对应阶段时由框架调用：

```ts
import { Service, OnInit, OnReady, OnDestroy } from "@vecmat/kirinriki";
import type { Kirinriki } from "@vecmat/kirinriki";

@Service()
export class DbService {
    private pool: ConnectionPool;

    /** init() 开始时、路由注册前触发：建立连接、预热缓存 */
    @OnInit()
    async connect(app: Kirinriki) {
        this.pool = await createPool();
    }

    /** init() 完成、路由注册后触发：启动定时任务、上报就绪 */
    @OnReady()
    warmup(app: Kirinriki) {
        console.log("routes mounted, service ready");
    }

    /** destroy() 时触发：释放连接、停止后台任务 */
    @OnDestroy()
    async close(app: Kirinriki) {
        await this.pool.end();
    }
}
```

| 装饰器 | 触发时机 | 典型用途 |
|--------|----------|----------|
| `@OnInit()` | `init()` 中，Addon 加载后、路由挂载前 | 建立数据库连接、预热缓存 |
| `@OnReady()` | `init()` 中，路由挂载后 | 启动定时任务、上报就绪状态 |
| `@OnDestroy()` | `destroy()` 时 | 释放连接、停止后台任务 |

## 方式二：应用函数钩子

链式注册，适合不便于用 Bean 表达的场景（如入口文件的临时逻辑）：

```ts
const app = new Kirinriki({ silent: true });

app.onInit(async (app) => {
    // 配置中心已就绪，可直接读取
    const env = await app.config.get<string>("app.env");
    console.log("booting in", env);
});

app.onReady((app) => {
    console.log("ready to serve");
});

app.onDestroy(async (app) => {
    console.log("shutting down");
});

await app.init();
// ... 运行 ...
await app.destroy();
```

三个方法均返回 `this`，支持链式调用。

## 优雅关闭

`destroy()` 负责业务资源清理（DESTROY 钩子 + Addon 卸载），但不持有监听句柄——停止监听由运行时负责：

```ts
// Node 示例
import { serve } from "@hono/node-server";

const app = new Kirinriki();
await app.init();
const server = serve({ fetch: app.fetch, port: 3000 });

process.on("SIGTERM", async () => {
    server.close();          // 停止接收新连接（运行时职责）
    await app.destroy();     // 释放业务资源（框架职责）
    process.exit(0);
});
```

## 与 Addon 生命周期的关系

- Addon `onLoad` **先于** INIT 钩子执行——Bean 的 `@OnInit` 里可以安全使用 Addon 注册的配置项与能力
- Addon `onUnload` **后于** DESTROY 钩子执行——Bean 的 `@OnDestroy` 里 Addon 能力仍可用
- 详见 [Addon 系统](./addon.md)

## API 参考

### 装饰器

| 装饰器 | 目标 | 说明 |
|--------|------|------|
| `@OnInit()` | Bean 方法 | INIT 阶段触发 |
| `@OnReady()` | Bean 方法 | READY 阶段触发 |
| `@OnDestroy()` | Bean 方法 | DESTROY 阶段触发 |

### 应用方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `app.onInit(fn)` | `(fn: (app) => any) => this` | 注册 INIT 函数钩子 |
| `app.onReady(fn)` | `(fn: (app) => any) => this` | 注册 READY 函数钩子 |
| `app.onDestroy(fn)` | `(fn: (app) => any) => this` | 注册 DESTROY 函数钩子 |
| `app.init()` | `() => Promise<this>` | 启动应用（触发 INIT/READY） |
| `app.destroy()` | `() => Promise<this>` | 销毁应用（触发 DESTROY） |

### 高级：`runLifecycle(event, app, fns?)`

生命周期执行器（内核与 Addon 共用），按「Bean 方法钩子 → 函数钩子」顺序串行执行指定事件的全部钩子：

```ts
import { runLifecycle, LifecycleEvent } from "@vecmat/kirinriki";

// 自定义场景手动触发某个阶段（一般不需要，框架已自动驱动）
await runLifecycle(LifecycleEvent.READY, app);
```
