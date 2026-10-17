import { container } from "./container";
import { LIFECYCLE_KEY, LifecycleEvent } from "./define";
import type { Kirinriki } from "./app";

/** 函数形式的生命周期钩子：接收应用实例 */
export type LifecycleHookFn = (app: Kirinriki) => any;

/**
 * 执行指定生命周期事件的全部钩子。
 *
 * 执行顺序：先 Bean 方法钩子（@OnInit/@OnReady/@OnDestroy，按 Bean 注册顺序），
 * 后 app.onInit/onReady/onDestroy 注册的函数钩子（按注册顺序），
 * 全部串行 await，任一钩子抛错会中断后续钩子并向上抛出。
 *
 * @param event 生命周期事件
 * @param app 应用实例（作为钩子入参）
 * @param fns 通过 app.onInit/onReady/onDestroy 注册的函数钩子
 */
export async function runLifecycle(
    event: LifecycleEvent,
    app: Kirinriki,
    fns: LifecycleHookFn[] = [],
): Promise<void> {
    for (const def of container.getDefinitions()) {
        for (const meta of container.listPropertyData<{
            event: LifecycleEvent;
        }>(LIFECYCLE_KEY, def.clazz)) {
            if (meta.data.event !== event) continue;
            const instance = container.get(def.id);
            await instance?.[meta.propertyKey]?.call(instance, app);
        }
    }
    for (const fn of fns) {
        await fn(app);
    }
}
