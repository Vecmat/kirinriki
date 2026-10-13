/**
 * 测试隔离工具。
 *
 * 框架的 `Container` 与 `AppRegistry` 均为全局单例，
 * 测试间会相互污染。`Container.reset()` 会替换静态单例，
 * 但所有源码（装饰器、Router、App）都通过 `import { container }`
 * 引用最初捕获的实例，因此这里直接清空该实例的内部 Map，
 * 保证装饰器写入与测试读取看到的是同一份清空后的状态。
 */
import "reflect-metadata";
import { container } from "../../src/core/container";
import { appRegistry } from "../../src/core/app-registry";

interface ContainerInternals {
    registry?: Map<unknown, unknown>;
    typeRegistry?: Map<unknown, unknown[]>;
    propertyStore?: Map<unknown, unknown[]>;
}

interface AppRegistryInternals {
    apps?: Map<unknown, unknown>;
    controllerAppMap?: Map<unknown, unknown>;
}

/** 重置容器与注册表的全局单例（in-place 清空内部 Map），保证测试隔离 */
export function resetGlobals(): void {
    const c = container as unknown as ContainerInternals;
    c.registry?.clear();
    c.typeRegistry?.clear();
    c.propertyStore?.clear();

    const r = appRegistry as unknown as AppRegistryInternals;
    r.apps?.clear();
    r.controllerAppMap?.clear();
}

/**
 * 临时设置 process.env 的键值，返回恢复函数。
 * 用于测试基于环境变量的分支，避免污染全局环境。
 */
export function withEnv(key: string, value: string | undefined): () => void {
    const had = Object.prototype.hasOwnProperty.call(process.env, key);
    const prev = process.env[key];
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
    return () => {
        if (had) {
            process.env[key] = prev;
        } else {
            delete process.env[key];
        }
    };
}

/** 静默并捕获 console 输出，便于断言框架内部打印行为 */
export function captureConsole(): {
    restore: () => void;
    logs: Record<"log" | "info" | "warn" | "error" | "debug", unknown[][]>;
} {
    const logs: Record<
        "log" | "info" | "warn" | "error" | "debug",
        unknown[][]
    > = {
        log: [],
        info: [],
        warn: [],
        error: [],
        debug: [],
    };
    const methods: Array<"log" | "info" | "warn" | "error" | "debug"> = [
        "log",
        "info",
        "warn",
        "error",
        "debug",
    ];
    const originals = methods.map((m) => {
        const orig = console[m].bind(console);
        console[m] = ((...args: unknown[]) => {
            logs[m].push(args);
        }) as never;
        return [m, orig] as const;
    });
    return {
        restore: () => {
            for (const [m, orig] of originals) {
                console[m] = orig as never;
            }
        },
        logs,
    };
}
