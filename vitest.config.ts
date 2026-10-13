import { defineConfig } from "vitest/config";

// Vitest 配置。
// - 使用 esbuild 转译 TypeScript（不依赖 TS 编译器 JS API，兼容 TS 7 native preview）；
// - 启用 experimentalDecorators + emitDecoratorMetadata 以支持框架装饰器元数据；
// - 测试位于 tests/，命名 *.test.ts，与 src/ 镜像。
export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        globals: true,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/index.ts", "src/mod.ts", "src/types/**"],
        },
        clearMocks: true,
    },
    esbuild: {
        target: "es2022",
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                target: "es2022",
                module: "commonjs",
                esModuleInterop: true,
                strict: false,
                skipLibCheck: true,
                types: ["node", "reflect-metadata"],
            },
        },
    },
});
