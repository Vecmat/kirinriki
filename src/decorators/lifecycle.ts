import { container } from "../core/container";
import { LIFECYCLE_KEY, LifecycleEvent } from "../core/define";

/**
 * 生命周期钩子方法装饰器。
 *
 * 标记在任意 Bean（@Component/@Service/@Controller 等）的方法上，
 * 应用进入对应生命周期阶段时由框架按 Bean 注册顺序依次调用。
 * 钩子方法签名：`(app: Kirinriki) => any | Promise<any>`。
 */
function lifecycleHook(event: LifecycleEvent): MethodDecorator {
    return (target: any, propertyKey: string | symbol) => {
        container.attachPropertyData(
            LIFECYCLE_KEY,
            { event },
            target,
            propertyKey,
        );
    };
}

/**
 * 在 `app.init()` 开始时、路由注册前触发。
 * 适合建立数据库连接、预热缓存等准备工作。
 */
export function OnInit(): MethodDecorator {
    return lifecycleHook(LifecycleEvent.INIT);
}

/**
 * 在 `app.init()` 完成、路由注册后触发。
 * 适合启动定时任务、上报就绪状态等收尾工作。
 */
export function OnReady(): MethodDecorator {
    return lifecycleHook(LifecycleEvent.READY);
}

/**
 * 在 `app.destroy()` 时触发。
 * 适合释放连接、停止后台任务等优雅关闭清理工作。
 */
export function OnDestroy(): MethodDecorator {
    return lifecycleHook(LifecycleEvent.DESTROY);
}
