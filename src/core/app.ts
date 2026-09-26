import { Hono } from "hono";
import { Router } from "./router";
import { WELCOME, LOGO } from "../base/Constants";

/**
 * Kirinriki 应用核心。
 *
 * 框架只负责构建与导出 Hono 应用（fetch handler），
 * 不绑定任何具体运行时的监听逻辑，也不做文件系统扫描——
 * 因为 Cloudflare Workers 等环境不支持动态加载。
 *
 * 类的注册方式：在入口手动 import 各模块，
 * 装饰器在模块求值时自动把类注册进 IOC 容器（Node/Deno/Bun/Workers 通用）。
 */
export class Kirinriki {
  /** Hono 实例，各运行时兼容层以此作为 fetch 入口 */
  public readonly hono: Hono;
  private router: Router;

  constructor(silent = false) {
    if (!silent) {
      console.log(LOGO);
      console.log(WELCOME);
    }

    this.hono = new Hono();
    this.router = new Router(this.hono);
  }

  /** 挂载容器中已注册的路由。需在导出/监听前 await 完成 */
  async init(): Promise<this> {
    this.router.registerRoutes();
    return this;
  }

  /** Web 标准 fetch 处理器，等价于 hono.fetch，可直接交给任意兼容运行时 */
  get fetch() {
    return this.hono.fetch;
  }
}

export function createApp(silent = false): Kirinriki {
  return new Kirinriki(silent);
}
