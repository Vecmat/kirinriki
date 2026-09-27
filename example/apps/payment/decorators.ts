import { createAppDecorators } from "@vecmat/kirinriki";

/**
 * Payment 应用专用装饰器集合。
 * 调用 createAppDecorators("payment") 后，此处导出的 @Controller 已自动绑定 app: "payment"。
 */
export const {
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
