import { createAppDecorators } from "@vecmat/kirinriki";

/**
 * Payment 应用专用装饰器集合。
 * 应用全部元数据（name/basePath/hash/staticDir）集中于此一处声明：
 * - 此处导出的 @App 已绑定完整选项，声明应用时无参使用；
 * - @Controller 已自动绑定 app: "payment"。
 */
export const {
    App,
    Controller,
    Component,
    Service,
    Action,
    Middleware,
    Autowired,
    Inject,
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
} = createAppDecorators({
    name: "payment",
    basePath: "/payment",
    hash: "b3a22171",
    staticDir: "apps/payment/static",
});
