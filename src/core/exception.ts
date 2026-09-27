/**
 * 框架业务异常。
 *
 * 每个异常携带全局唯一的 `errorKey`，可被 `@Catched` 处理器按 key 匹配
 * （支持 `PREFIX_*` 通配），用于统一的声明式错误处理。
 *
 * @example
 * ```ts
 * throw new Exception("API_USER_NOT_FOUND", "用户不存在", 404);
 * ```
 */
export class Exception extends Error {
    /** 全局唯一错误标识，@Catched 依据它匹配处理器 */
    public errorKey: string;
    /** 错误描述信息 */
    public errorMessage: string;
    /** 建议的 HTTP 响应状态码，默认 500 */
    public status: number;

    /**
     * @param errorKey 全局唯一错误标识（如 `"API_DEMO_ERROR"`）
     * @param message 错误描述，缺省时取 errorKey
     * @param status 建议的 HTTP 状态码，默认 500
     */
    constructor(errorKey: string, message?: string, status: number = 500) {
        super(message || errorKey);
        this.errorKey = errorKey;
        this.errorMessage = message || errorKey;
        this.status = status;
    }
}

/**
 * 快速创建 {@link Exception} 实例的工具函数。
 *
 * @param errorKey 全局唯一错误标识
 * @param message 错误描述
 * @param status 建议的 HTTP 状态码
 * @returns 构造完成的 Exception 实例
 */
export function createException(errorKey: string, message?: string, status?: number): Exception {
    return new Exception(errorKey, message, status);
}
