/**
 * 注解元数据共享工具（内部实现，不对外导出）。
 *
 * Addon 注解族（`@Addon` / `@Savant` / `@Config`）把声明元数据通过
 * `Reflect` 挂在**类本身**而非容器：Addon 类通常位于框架之外的模块，
 * 其声明在模块求值时产生一次，不应随容器重置而丢失。
 */
import "reflect-metadata";

/** 参数是类本身（类装饰器）还是类原型（方法/属性装饰器） */
export function classOf(target: any): any {
    return typeof target === "function" ? target : target.constructor;
}

/** 向类上的元数据数组追加一条声明（仅 own metadata，避免子类共享父类数组） */
export function pushMeta<T>(key: string, clazz: any, entry: T): void {
    const list = (Reflect.getOwnMetadata(key, clazz) as T[] | undefined) ?? [];
    Reflect.defineMetadata(key, [...list, entry], clazz);
}

/** 读取类上的元数据数组（仅 own metadata） */
export function ownMeta<T>(key: string, clazz: any): T[] {
    return (Reflect.getOwnMetadata(key, clazz) as T[] | undefined) ?? [];
}
