import { Autowired, Exception, Logger, Cache } from "@vecmat/kirinriki";
import {
    Controller,
    Get,
    Post,
    ParamsBody,
    ParamsHeader,
} from "../base/decorators";
import { AuthService } from "../service/auth";
import { VerifyTokenAction } from "../action/verify-token";

/**
 * Auth 应用控制器。
 * 使用应用本地装饰器（base/decorators.ts），@Controller 自动绑定 app: "auth"，
 * 路由自动拼接应用 basePath，最终为 /auth/*
 */
@Controller("/")
export class AuthController {
    @Autowired(AuthService)
    private authService!: AuthService;

    @Autowired(VerifyTokenAction)
    private verifyTokenAction!: VerifyTokenAction;

    @Autowired(Logger)
    private logger!: Logger;

    @Autowired(Cache)
    private cache!: Cache;

    /** 登录接口：POST /auth/login */
    @Post("/login")
    async login(
        @ParamsBody("username") username: string,
        @ParamsBody("password") password: string,
    ) {
        const result = this.authService.login(username, password);
        if (!result) {
            throw new Exception(
                "AUTH_INVALID_CREDENTIALS",
                "用户名或密码错误",
                401,
            );
        }
        // 缓存登录态
        this.cache.set(`auth:session:${result.token}`, username, 3600_000);
        this.logger.info(`User logged in: ${username}`);
        return result;
    }

    /** 令牌校验接口：GET /auth/verify?token=xxx */
    @Get("/verify")
    async verify(@ParamsHeader("x-token") token: string) {
        const valid = this.verifyTokenAction.execute(token);
        return { valid };
    }

    /** 获取当前登录用户：GET /auth/me */
    @Get("/me")
    async me(@ParamsHeader("x-token") token: string) {
        const valid = this.verifyTokenAction.execute(token);
        if (!valid) {
            throw new Exception("AUTH_UNAUTHORIZED", "未登录", 401);
        }
        const username = this.cache.get(`auth:session:${token}`) || "admin";
        return { username };
    }
}
