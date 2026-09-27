import "reflect-metadata";

import { Kirinriki } from "@vecmat/kirinriki";

// printRoutes: true 开启路由表格打印；也可用环境变量 KIRINRIKI_PRINT_ROUTES=1
const app = new Kirinriki({ printRoutes: true });

import "./index";
// 子应用：每个应用的 index.ts 负责加载本应用全部模块
import "./apps/auth";
import "./apps/payment";
import "./apps/test";

export default app;
