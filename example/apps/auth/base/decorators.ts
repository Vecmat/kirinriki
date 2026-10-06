import { createAppDecorators } from "@vecmat/kirinriki";

/**
 * Auth 应用专用装饰器集合。
 * 应用全部元数据（name/basePath/hash/staticDir）集中于此一处声明：
 * - 此处导出的 @App 已绑定完整选项，声明应用时无参使用；
 * - @Controller 已自动绑定 app: "auth"，应用内控制器无需再传 { app: "auth" }。
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
    name: "auth",
    basePath: "/auth",
    hash: "953fa84f",
    staticDir: "apps/auth/static",
});
