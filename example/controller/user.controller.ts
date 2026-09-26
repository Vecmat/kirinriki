import { Controller, Autowired } from "../../src/decorators/component";
import { Get, Post, Put, Delete } from "../../src/decorators/route";
import { ParamsPath, ParamsBody, ParamsHeader, InjectParams } from "../../src/decorators/param";
import { Before } from "../../src/decorators/aop";
import { Exception, Catched } from "../../src/decorators/exception";
import { Valid, Validated } from "../../src/decorators/validation";
import { UserService, UserSchema, User } from "../service/user.service";

// 自定义参数注解：通过 InjectParams 全局注册，任意控制器可直接使用
const UserAgent = () => InjectParams("UserAgent", async (ctx: any) => ctx.req.header("user-agent") || "unknown");

@Controller("/user")
export class UserController {
    // Deno 等运行时不支持 emitDecoratorMetadata（design:type），
    // @Autowired 需显式传入依赖类，Node/Bun 下同样适用
    @Autowired(UserService)
    userService!: UserService;

    @Get("/")
    @Before("LogAspect") // 组件切面：引用容器中的 LogAspect
    async list() {
        return await this.userService.list();
    }

    @Get("/agent")
    async agent(@UserAgent() ua: string) {
        return { userAgent: ua };
    }

    @Get("/:id")
    async getById(
        @ParamsPath("id") id: string,
        @ParamsHeader("x-token") @Valid((v) => !!v, { message: "Token missing" }) token: string
    ) {
        return this.userService.findById(id);
    }

    @Post("/")
    @Validated(UserSchema)
    @Before(async (ctx: any) => console.log("[AOP] before create:", ctx.req.method, ctx.req.path)) // 内联函数切面
    async create(@ParamsBody() user: User) {
        return this.userService.create(user);
    }

    @Put("/:id")
    async update(@ParamsPath("id") id: string, @ParamsBody() user: Partial<User>) {
        return { id, ...user };
    }

    @Delete("/:id")
    async delete(@ParamsPath("id") id: string) {
        return { deleted: id };
    }

    @Post("/test")
    @Exception("API_DEMO_ERROR", "用户创建失败")
    async test() {
        throw new Error("something unexpected happened");
    }

    @Catched("API_*")
    async catchApiError(err: any, ctx: any) {
        console.log("Caught API error:", err.errorKey, err.errorMessage);
        return { caught: true, errorKey: err.errorKey, message: err.errorMessage };
    }
}
