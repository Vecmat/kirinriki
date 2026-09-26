import { Component } from "../../src/decorators/component";

@Component()
export class LogAspect {
    async before(ctx: any, ...args: any[]) {
        console.log(`[Before] ${ctx.req.method} ${ctx.req.url}`);
    }

    async after(ctx: any, result: any, ...args: any[]) {
        console.log(`[After] Result:`, result);
    }

    async around(ctx: any, method: Function, ...args: any[]) {
        const start = Date.now();
        const result = await method(...args);
        const duration = Date.now() - start;
        console.log(`[Around] Execution took ${duration}ms`);
        return result;
    }
}
