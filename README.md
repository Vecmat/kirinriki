<p align="center">
<pre align="center" style="font-size: 6px;">
    _    _      _            _ _    _
    | |  (_)    (_)          (_) |  (_)
    | | ___ _ __ _ _ __  _ __ _| | ___
    | |/ / | '__| | '_ \| '__| | |/ / |
    |   <| | |  | | | | | |  | |   <| |
    |_|\_\_|_|  |_|_| |_|_|  |_|_|\_\_|

 == https://github.com/vecmat/kirinriki ==
 🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌑
</pre>

<p align="center">
    <a href="https://jsr.io/@vecmat/kirinriki">
        <img src="https://jsr.io/badges/@vecmat" alt="" />
    </a>
    <a href="https://jsr.io/@vecmat/kirinriki">
        <img src="https://jsr.io/badges/@vecmat/kirinriki" alt="" />
    </a>
    <a href="https://jsr.io/@vecmat/kirinriki">
        <img src="https://jsr.io/badges/@vecmat/kirinriki/score" alt="" />
    </a>
    <a href="https://jsr.io/@vecmat/kirinriki">
        <img src="https://jsr.io/badges/@vecmat/kirinriki/total-downloads" alt="" />
    </a>
    <a href="https://jsr.io/@<scope>/<package>">
        <img src="https://jsr.io/badges/@vecmat/kirinriki/weekly-downloads" alt="" />
    </a>
</p>
</p>

# Kirinriki


A framework written in TypeScript that provides REST API to build amazing server-side applications!

## Naming

`Kirinriki` is a Pokémon!
It is a word with palindrome in multiple languages.Like as koa's onion skin model.

Chinese: `麒麟麒`
English: `Girafarig`
Thai: `คิรินริกิ` `Kirinriki`
Korean:  `키링키` `Kirinriki`
Japanese: `キリンリキ` `Kirinriki`



基于 [Hono](https://hono.dev/) 的企业级 TypeScript Web 框架，提供完整的依赖注入、声明式路由、AOP 和参数验证能力。

## 特性

- **IOC 容器**：`@Controller`、`@Service`、`@Autowired` 依赖注入
- **声明式路由**：`@Get`、`@Post`、`@Put`、`@Delete` 等方法装饰器
- **参数提取**：`@ParamsQuery`、`@ParamsPath`、`@ParamsBody`、`@ParamsHeader`
- **自动验证**：`@Valid`、`@Validated` 配合 zod
- **AOP 切面**：`@Before`、`@After`、`@Around` 拦截器
- **异常处理**：`@Exception`、`@Catched` 全局错误捕获（支持 `API_*` 通配）
- **跨运行时**：Node.js、Deno、Bun、Cloudflare Workers（框架仅依赖 hono / zod / reflect-metadata）

## 安装

```bash
# Deno
deno add jsr:@vecmat/kirinriki

# Node.js (npm / pnpm / yarn)
npx jsr add @vecmat/kirinriki

# Bun
bunx jsr add @vecmat/kirinriki
```

## 快速开始

```typescript
// main.ts
import { Kirinriki } from "@vecmat/kirinriki";
import "reflect-metadata";

const app = new Kirinriki();

// 手动导入控制器（Cloudflare Workers 等环境不支持动态加载）
import "./user.controller";

await app.init();

// Node.js / Bun
import { serve } from "@hono/node-server";
serve({ fetch: app.fetch, port: 3000 });

// Deno
// Deno.serve({ port: 3000 }, app.fetch);

// Cloudflare Workers
// export default { fetch: app.fetch };
```

```typescript
// user.controller.ts
import { Controller, Get, Post, Autowired, ParamsPath, Validated } from "@vecmat/kirinriki";
import { z } from "zod";
import { UserService } from "./user.service";

const UserSchema = z.object({
    name: z.string().min(1),
    email: z.string().email()
});

@Controller("/user")
export class UserController {
    @Autowired(UserService)
    private userService!: UserService;

    @Get("/")
    async list() {
        return this.userService.findAll();
    }

    @Get("/:id")
    async getById(@ParamsPath("id") id: string) {
        return this.userService.findById(id);
    }

    @Post("/")
    @Validated(UserSchema)
    async create(@ParamsBody() body: any) {
        return this.userService.create(body);
    }
}
```

## 核心概念

### 依赖注入

```typescript
@Service()
export class UserService {
    findAll() {
        return [{ id: 1, name: "Alice" }];
    }
}

@Controller("/user")
export class UserController {
    // 建议显式传类：Deno 等运行时不发射 design:type 元数据
    @Autowired(UserService)
    userService!: UserService;
}
```

### AOP 切面

```typescript
@Component()
export class LogAspect {
    async before(ctx: any) {
        console.log(`[Before] ${ctx.req.method} ${ctx.req.path}`);
    }
}

@Controller("/api")
export class ApiController {
    @Before("LogAspect") // 引用容器组件；也可直接传内联函数
    @Get("/data")
    async getData() { /* ... */ }
}
```

### 全局异常处理

```typescript
import { Exception, Catched } from "@vecmat/kirinriki";

@Controller("/api")
export class ApiController {
    @Get("/error")
    async throwError() {
        throw new Exception("API_ERROR", "Something went wrong");
    }

    @Catched("API_*") // 捕获所有 API_ 前缀的错误
    async handleApiError(err: Exception, ctx: any) {
        return ctx.json({ error: err.errorMessage, code: err.errorKey }, 400);
    }
}
```

### 自定义参数装饰器

```typescript
import { InjectParams } from "@vecmat/kirinriki";

const UserAgent = () =>
    InjectParams("UserAgent", (ctx) => ctx.req.header("user-agent") || "unknown");

@Controller("/")
export class AppController {
    @Get("/info")
    async info(@UserAgent() ua: string) {
        return { userAgent: ua };
    }
}
```

### 路由表格打印

应用启动时可打印已注册路由的 ASCII 表格，方便测试查阅：

```
 Kirinriki Routes
+--------+--------------------------+---------+-------------------------------+
| Method | Path                     | App     | Handler                       |
+--------+--------------------------+---------+-------------------------------+
| GET    | /user/                   | (root)  | UserController.list           |
| POST   | /auth/login              | auth    | AuthController.login          |
| GET    | /payment/orders/:orderId | payment | PaymentController.getOrder    |
+--------+--------------------------+---------+-------------------------------+
 Total: 12 routes
```

支持两种开关方式（可任选其一）：

**方式一：构造函数参数**

```typescript
const app = new Kirinriki({ printRoutes: true });
```

**方式二：环境变量**（无需改代码）

```bash
# Node.js / Bun
KIRINRIKI_PRINT_ROUTES=1 npm run example

# Deno
KIRINRIKI_PRINT_ROUTES=1 deno task start
```

环境变量值为 `1`、`true`、`yes`（不区分大小写）时开启；构造参数优先级高于环境变量。

## 运行时兼容性

框架本身只使用标准 Web API 与 hono/zod，可运行于：

| 运行时 | 支持情况 | 说明 |
| --- | --- | --- |
| Node.js | ✅ | 需 TypeScript/Babel 转译装饰器，监听用 `@hono/node-server` |
| Deno | ✅ | 需启用 `experimentalDecorators` |
| Bun | ✅ | 原生运行（建议先转译） |
| Cloudflare Workers | ✅ | 先编译再打包；入口手动 import 模块注册 |

### TypeScript 配置

```json
{
    "compilerOptions": {
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    }
}
```

### Deno 配置（deno.json）

```json
{
    "compilerOptions": {
        "experimentalDecorators": true
    },
    "unstable": ["sloppy-imports"]
}
```


## 许可证

MIT License
