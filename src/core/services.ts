import { Exception } from "./exception";

/**
 * 共享服务容器：挂在应用下的通用对象注册表（Map 语义）。
 *
 * 目的：跨 Addon / 应用共享**运行时对象**（如 Redis 客户端、消息队列连接、
 * 定时任务句柄）——不通过 import 引入，也不进 IOC 容器参与构造注入，
 * 而是作为「资源句柄」在运行期按名共享：
 *
 * - 提供方（通常是 Addon）：onLoad 中 `scope.services.set("redis", client)`
 * - 消费方（其他 Addon）：`scope.services.get<Redis>("redis")`
 * - 主应用：`app.services.get<Redis>("redis")`
 *
 * 与 IOC 容器（Container）的分工：
 * - Container：类 Bean 的构造与依赖注入（`@Autowired`），面向可由容器
 *   实例化的「服务实现」
 * - ServiceRegistry：外部资源句柄的共享，面向连接串来自配置、生命周期
 *   由 Addon 接管的「连接 / 客户端」这类无法由容器构造的对象
 *
 * key 约定：以提供方 Addon 名命名（如 `"redis"`），子对象用点分（`"redis.sub"`）。
 * 生命周期：提供方在 onLoad 注册、onUnload 移除；应用 destroy 时框架在
 * 全部 Addon 卸载后 clear 兜底。
 */
export class ServiceRegistry {
    private map = new Map<string, unknown>();

    /** 已注册服务名（按注册顺序） */
    listNames(): string[] {
        return [...this.map.keys()];
    }

    /** 是否已注册指定服务 */
    has(name: string): boolean {
        return this.map.has(name);
    }

    /**
     * 注册共享服务。
     *
     * @throws SERVICE_DUPLICATED 同名服务已注册（如需覆盖请先 remove）
     */
    set<T>(name: string, service: T): void {
        if (this.map.has(name)) {
            throw new Exception(
                "SERVICE_DUPLICATED",
                `共享服务 "${name}" 已注册，如需覆盖请先 remove`,
                409,
            );
        }
        this.map.set(name, service);
    }

    /** 获取共享服务；未注册返回 undefined */
    get<T = unknown>(name: string): T | undefined {
        return this.map.get(name) as T | undefined;
    }

    /**
     * 获取共享服务；未注册抛 SERVICE_NOT_FOUND——
     * 依赖方（如 RateLimit 依赖 Redis）在加载期尽早失败。
     *
     * @throws SERVICE_NOT_FOUND 服务未注册
     */
    require<T = unknown>(name: string): T {
        const svc = this.map.get(name);
        if (svc === undefined) {
            throw new Exception(
                "SERVICE_NOT_FOUND",
                `共享服务 "${name}" 未注册：请确认提供方 Addon（或主应用）已先注册`,
                409,
            );
        }
        return svc as T;
    }

    /** 移除共享服务（提供方卸载时调用）；返回该服务是否存在 */
    remove(name: string): boolean {
        return this.map.delete(name);
    }

    /** 清空全部服务（框架在应用 destroy 时兜底调用） */
    clear(): void {
        this.map.clear();
    }
}
