import { Action, Autowired, Logger } from "@vecmat/kirinriki";
import { AuthService } from "../service/auth";

/**
 * Auth 应用的内部动作（Action）。
 *
 * 与 HTTP 请求分离，可被本应用控制器调用，也可被 CLI 等工具复用。
 * 约定：不跨应用引用；应用间关联靠前端 + 数据库。
 */
@Action()
export class VerifyTokenAction {
    @Autowired(AuthService)
    private authService!: AuthService;

    @Autowired(Logger)
    private logger!: Logger;

    /** 执行令牌校验 */
    execute(token: string): boolean {
        this.logger.debug(
            `VerifyTokenAction.execute: token=${token?.slice(0, 20)}...`,
        );
        return this.authService.verifyToken(token);
    }
}
