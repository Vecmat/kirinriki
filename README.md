# Kirinriki

基于 Hono 的企业级 TypeScript Web 框架，提供完整的依赖注入、声明式路由、AOP 和参数验证能力。

## 特性

- **IOC 容器**：`@Controller`、`@Service`、`@Autowired` 依赖注入
- **声明式路由**：`@Get`、`@Post`、`@Put`、`@Delete` 等方法装饰器
- **参数提取**：`@ParamsQuery`、`@ParamsPath`、`@ParamsBody`、`@ParamsHeader`
- **自动验证**：`@Valid`、`@Validated` 配合 zod
- **AOP 切面**：`@Before`、`@After`、`@Around` 拦截器
- **异常处理**：`@Exception`、`@Catched` 全局错误捕获
- **跨运行时**：支持 Node.js、Deno、Bun、Cloudflare Workers

## 安装

```bash
# Deno
deno add jsr:@kirinriki/core

# Node.js (npm)
npm install @kirinriki/core

# Bun
bun add @kirinriki/core
```

## 快速开始

```typescript
// main.ts
import { Kirinriki } from "@kirinriki/core";
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
import { Controller, Get, Post, Autowired, ParamsPath, Validated } from "@kirinriki/core";
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
    @Autowired(UserService)  // 自动注入
    userService!: UserService;
}
```

### AOP 切面

```typescript
@Component()
export class LogAspect {
    @Before()
    async log(ctx: any) {
        console.log(`[Before] ${ctx.req.method} ${ctx.req.path}`);
    }
}

@Controller("/api")
export class ApiController {
    @Before("LogAspect")  // 引用组件
    @Get("/data")
    async getData() { ... }
}
```

### 全局异常处理

```typescript
import { Exception, Catched } from "@kirinriki/core";

@Controller("/api")
export class ApiController {
    @Get("/error")
    async throwError() {
        throw new Exception("API_ERROR", "Something went wrong");
    }

    @Catched("API_*")  // 捕获所有 API_ 前缀的错误
    async handleApiError(err: Exception, ctx: any) {
        return ctx.json({ error: err.message, code: err.errorKey }, 400);
    }
}
```

### 自定义参数装饰器

```typescript
import { InjectParams } from "@kirinriki/core";

const UserAgent = () => InjectParams("UserAgent", async (ctx) =>
    ctx.req.header("user-agent") || "unknown"
);

@Controller("/")
export class AppController {
    @Get("/info")
    async info(@UserAgent() ua: string) {
        return { userAgent: ua };
    }
}
```

## 环境配置

### TypeScript

```json
{
    "compilerOptions": {
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    }
}
```

### Deno

```json
{
    "compilerOptions": {
        "experimentalDecorators": true
    },
    "unstable": ["sloppy-imports"]
}
```


## 许可证

MIT
