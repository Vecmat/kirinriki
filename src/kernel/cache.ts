/**
 * 框架级缓存服务。
 *
 * 当前为内存 KV 缓存实现，预留接口以便后期替换为
 * Redis / Cloudflare KV / R2 等远程存储。
 * 支持 TTL 过期自动清理。
 */
export class Cache {
    private store = new Map<string, { value: any; expireAt: number | null }>();

    /**
     * 设置缓存。
     * @param key 缓存键
     * @param value 缓存值
     * @param ttl 过期时间（毫秒），不传表示永不过期
     */
    set(key: string, value: any, ttl?: number): void {
        this.store.set(key, {
            value,
            expireAt: ttl ? Date.now() + ttl : null,
        });
    }

    /**
     * 获取缓存。过期或不存在返回 undefined。
     */
    get<T = any>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (entry.expireAt && Date.now() > entry.expireAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    /** 删除指定缓存 */
    delete(key: string): boolean {
        return this.store.delete(key);
    }

    /** 清空全部缓存 */
    clear(): void {
        this.store.clear();
    }

    /** 判断键是否存在且未过期 */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }
}
