import { Service, Autowired, Logger } from "@vecmat/kirinriki";

/**
 * Auth 应用内部业务服务。
 * 约定：不跨应用引用，仅在 auth 应用内部使用。
 */
@Service()
export class AuthService {
    @Autowired(Logger)
    private logger!: Logger;

    /** 模拟登录校验 */
    login(username: string, password: string): { token: string } | null {
        this.logger.info(`AuthService.login: user=${username}`);
        // 模拟：admin/123456 登录成功
        if (username === "admin" && password === "123456") {
            return { token: "mock-jwt-token-" + Date.now() };
        }
        return null;
    }

    /** 模拟令牌校验 */
    verifyToken(token: string): boolean {
        return token?.startsWith("mock-jwt-token-");
    }
}
