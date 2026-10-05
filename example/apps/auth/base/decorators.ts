import { createAppDecorators } from "@vecmat/kirinriki";

/**
 * Auth 应用专用装饰器集合。
 * 调用 createAppDecorators("auth") 后：
 * - 此处导出的 @App 已自动绑定 name: "auth"，声明应用时无需再传 name；
 * - @Controller 已自动绑定 app: "auth"，应用内控制器无需再传 { app: "auth" }。
 */
export const {
    App,
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Options,
    Head,
    All,
    ParamsQuery,
    ParamsPath,
    ParamsBody,
    ParamsHeader,
    Ctx,
    Valid,
    Validated,
    Before,
    After,
    Around,
} = createAppDecorators("auth");
