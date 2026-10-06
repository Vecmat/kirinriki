import { App } from "./decorators";

// 加载本应用所有模块（触发装饰器注册）
import "./payment.controller";
import "./payment.service";

/**
 * Payment 应用入口。
 *
 * 约定：每个子应用的入口文件固定为 index.ts，
 * 负责加载本应用的全部模块（控制器、服务、动作等）。
 * 主应用只需 import 此文件即可注册整个应用。
 *
 * @App 来自本应用装饰器集合，全部选项已在 decorators.ts 中绑定。
 */
@App()
export class PaymentApp {}
