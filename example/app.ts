import "reflect-metadata";
import { Kirinriki } from "../src/core/app";

// Import controllers to trigger decorator registration
import "./controller/user.controller";

const app = new Kirinriki();

async function main() {
    await app.init();
    app.listen(3000);
}

main().catch(console.error);
