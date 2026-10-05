import { createAppDecorators } from "@vecmat/kirinriki";

/**
 * Payment 应用专用装饰器集合。
 * 调用 createAppDecorators("payment") 后：
 * - 此处导出的 @App 已自动绑定 name: "payment"，声明应用时无需再传 name；
 * - @Controller 已自动绑定 app: "payment"。
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
} = createAppDecorators("payment");
