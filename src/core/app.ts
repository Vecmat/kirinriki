import { Hono } from "hono";
import { container, BeanType } from "./container";
import { Router } from "./router";

export class Kirinriki {
    public hono: Hono;
    private router: Router;

    constructor() {
        this.hono = new Hono();
        this.router = new Router(this.hono);
    }

    async init(): Promise<void> {
        // Auto-register all controllers
        this.router.registerRoutes();
    }

    get fetch() {
        return this.hono.fetch;
    }

    listen(port: number): void {
        console.log(`Kirinriki server listening on port ${port}`);
        // For Node.js runtime
        const { serve } = require("@hono/node-server");
        serve({
            fetch: this.hono.fetch,
            port
        });
    }
}

export function createApp(): Kirinriki {
    return new Kirinriki();
}
