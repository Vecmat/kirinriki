import "reflect-metadata";
import { Logger } from "../../src/kernel/logger";
import { captureConsole, withEnv } from "../helpers/reset";

describe("Logger", () => {
    let cap: ReturnType<typeof captureConsole>;

    beforeEach(() => {
        cap = captureConsole();
    });

    afterEach(() => {
        cap.restore();
    });

    describe("prefix", () => {
        it("默认 prefix 'Kirinriki'", () => {
            const log = new Logger();
            log.info("hello");
            expect(cap.logs.info[0]).toContain("[Kirinriki][INFO]");
            expect(cap.logs.info[0]).toContain("hello");
        });

        it("自定义 prefix", () => {
            const log = new Logger("MyApp");
            log.info("x");
            expect(cap.logs.info[0]?.[0]).toBe("[MyApp][INFO]");
        });
    });

    describe("级别", () => {
        it("info 调用 console.info", () => {
            new Logger().info("a", "b");
            expect(cap.logs.info).toHaveLength(1);
            expect(cap.logs.info[0]?.[0]).toBe("[Kirinriki][INFO]");
            expect(cap.logs.info[0]?.[1]).toBe("a");
            expect(cap.logs.info[0]?.[2]).toBe("b");
        });

        it("warn 调用 console.warn", () => {
            new Logger().warn("w");
            expect(cap.logs.warn).toHaveLength(1);
            expect(cap.logs.warn[0]?.[0]).toBe("[Kirinriki][WARN]");
        });

        it("error 调用 console.error", () => {
            new Logger().error("e");
            expect(cap.logs.error).toHaveLength(1);
            expect(cap.logs.error[0]?.[0]).toBe("[Kirinriki][ERROR]");
        });
    });

    describe("debug", () => {
        it("默认不输出", () => {
            new Logger().debug("should not print");
            expect(cap.logs.debug).toHaveLength(0);
        });

        it("process.env.DEBUG 设置后输出", () => {
            const restore = withEnv("DEBUG", "1");
            try {
                new Logger().debug("printed");
            } finally {
                restore();
            }
            expect(cap.logs.debug).toHaveLength(1);
            expect(cap.logs.debug[0]?.[0]).toBe("[Kirinriki][DEBUG]");
            expect(cap.logs.debug[0]?.[1]).toBe("printed");
        });

        it("DEBUG 任意非空值即可触发", () => {
            const restore = withEnv("DEBUG", "kirinriki:*");
            try {
                new Logger().debug("yes");
            } finally {
                restore();
            }
            expect(cap.logs.debug).toHaveLength(1);
        });
    });
});
