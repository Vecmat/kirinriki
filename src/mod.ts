/**
 * Kirinriki —— 基于 Hono 的企业级 TypeScript Web 框架。
 *
 * 提供 IOC 容器与依赖注入、声明式路由、参数提取与校验、AOP 切面、
 * 全局异常处理等能力。框架只导出标准 Web `fetch` 处理器，
 * 可运行于 Node.js、Deno、Bun 与 Cloudflare Workers 等环境。
 *
 * 本文件是框架的统一入口（JSR / Deno 惯例的 `mod.ts`），
 * 与 `index.ts`（npm 惯例入口）导出内容完全一致。
 *
 * @example
 * ```ts
 * import { Kirinriki, Controller, Get } from "@vecmat/kirinriki";
 *
 * @Controller("/")
 * class HelloController {
 *   @Get("/")
 *   hello() { return "Hello Kirinriki"; }
 * }
 *
 * const app = new Kirinriki();
 * await app.init();
 * // Node/Bun: serve({ fetch: app.fetch }); Deno: Deno.serve(app.fetch)
 * ```
 *
 * @module
 */

export * from "./index";
