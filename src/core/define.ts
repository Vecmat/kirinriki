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
/** 切面定义（@Before/@After/@Around 通过 InjectAspect 注册） */
export const ASPECT_KEY = "ASPECT_KEY";
/** 异常处理器（@Catched） */
export const CATCH_KEY = "CATCH_KEY";
/** 依赖注入（@Autowired/@Inject） */
export const AUTOWIRED_KEY = "AUTOWIRED_KEY";
/** WebSocket 事件处理器（@OnOpen/@OnMessage/@OnClose/@OnError） */
export const WEBSOCKET_KEY = "WEBSOCKET_KEY";

/** 参数提取函数：从 Hono Context 中提取参数值 */
export type TParams = (ctx: any, idx?: number) => any;

/** 切面执行函数（Before/After） */
export type TAspectExec = (ctx: any, ...args: any[]) => any;

/** Around 切面执行函数：调用 next() 执行原方法 */
export type TAroundExec = (ctx: any, next: () => Promise<any>) => any;

/** 切面注解入参：内联执行函数 或 容器中的组件 id */
export type TAspectLike = TAspectExec | TAroundExec | string;
