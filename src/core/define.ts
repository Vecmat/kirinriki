/**
 * 容器元数据键定义
 * 所有装饰器都通过 container.attachPropertyData(KEY, data, target, method) 全局注册
 */

/** 控制器基础路径 */
export const CONTROLLER_KEY = "CONTROLLER_KEY";
/** 路由定义（@Get/@Post 等通过 InjectRouter 注册） */
export const ROUTER_KEY = "ROUTER_KEY";
/** 参数注入定义（@ParamsQuery 等通过 InjectParams 注册） */
export const TAGGED_PARAM = "TAGGED_PARAM";
/** 参数级校验器（@Valid） */
export const PARAM_VALIDATOR_KEY = "PARAM_VALIDATOR_KEY";
/** 方法级 DTO Schema（@Validated） */
export const VALIDATE_SCHEMA_KEY = "VALIDATE_SCHEMA_KEY";
/** 异常处理器（@Catched） */
export const CATCH_KEY = "CATCH_KEY";
/** 依赖注入（@Autowired/@Inject） */
export const AUTOWIRED_KEY = "AUTOWIRED_KEY";
/** WebSocket 事件处理器（@OnOpen/@OnMessage/@OnClose/@OnError） */
export const WEBSOCKET_KEY = "WEBSOCKET_KEY";
/** 生命周期钩子（@OnInit/@OnReady/@OnDestroy） */
export const LIFECYCLE_KEY = "LIFECYCLE_KEY";
/** 命名中间件引用（@Use：按名/内联函数启用中间件，可携带绑定参数） */
export const MIDDLEWARE_KEY = "MIDDLEWARE_KEY";
/**
 * Addon 类声明（@Addon：name/version/description）。
 * 与其余装饰器不同，Addon 元数据通过 Reflect 挂在**类本身**上——
 * Addon 类通常定义在框架之外的模块，模块求值时注册一次，
 * 不应随容器重置而丢失（容器只负责实例与 Bean 定义）。
 */
export const ADDON_KEY = "ADDON_KEY";
/** Addon 中间件方法声明（@Savant：名称/优先级/是否全局启用） */
export const SAVANT_KEY = "SAVANT_KEY";
/** Addon 配置项声明（@Config：类级或属性级） */
export const CONFIG_KEY = "CONFIG_KEY";

/** 应用生命周期事件 */
export enum LifecycleEvent {
    /** init() 开始时、路由注册前触发：适合建立连接、预热资源 */
    INIT = "init",
    /** init() 完成、路由已注册后触发：适合启动后台任务 */
    READY = "ready",
    /** destroy() 时触发：适合释放连接、清理资源（优雅关闭） */
    DESTROY = "destroy",
}

/** 参数提取函数：从 Hono Context 中提取参数值 */
export type TParams = (ctx: any, idx?: number) => any;
