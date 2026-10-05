import { App } from "./base/decorators";

/**
 * Auth 应用入口。
 *
 * 约定：每个子应用的入口文件固定为 index.ts，
 * 负责加载本应用的全部模块（控制器、服务、动作等）。
 * 主应用只需 import 此文件即可注册整个应用。
 *
 * @App 来自本应用装饰器集合，name: "auth" 已自动绑定。
 */
@App({
    basePath: "/auth",
    hash: "953fa84f",
    staticDir: "apps/auth/static",
})
export class AuthApp {}

// 加载本应用所有模块（触发装饰器注册）
import "./controller/auth";
import "./service/auth";
import "./action/verify-token";
