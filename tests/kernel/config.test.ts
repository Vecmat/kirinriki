import "reflect-metadata";
import { Config } from "../../src/kernel/config";
import { withEnv } from "../helpers/reset";

describe("Config", () => {
    let config: Config;

    beforeEach(() => {
        config = new Config();
    });

    describe("getString", () => {
        it("命中返回值", () => {
            const restore = withEnv("MY_KEY", "hello");
            try {
                expect(config.getString("MY_KEY")).toBe("hello");
            } finally {
                restore();
            }
        });

        it("未命中返回默认值", () => {
            expect(config.getString("NOT_SET_X", "fallback")).toBe("fallback");
        });

        it("默认默认值为空串", () => {
            expect(config.getString("NOT_SET_Y")).toBe("");
        });
    });

    describe("getNumber", () => {
        it("数字字符串解析为数值", () => {
            const restore = withEnv("PORT", "3000");
            try {
                expect(config.getNumber("PORT")).toBe(3000);
            } finally {
                restore();
            }
        });

        it("非数字返回默认值", () => {
            const restore = withEnv("BAD_NUM", "abc");
            try {
                expect(config.getNumber("BAD_NUM", 99)).toBe(99);
            } finally {
                restore();
            }
        });

        it("未设置返回默认值 0", () => {
            expect(config.getNumber("NOT_SET_N")).toBe(0);
        });

        it("空串：Number(\"\")=0，返回 0（不返回默认值）", () => {
            const restore = withEnv("EMPTY_N", "");
            try {
                // 源码逻辑：getString 返回 ""（?? 不命中默认值），Number("")=0 视为 finite
                expect(config.getNumber("EMPTY_N", 7)).toBe(0);
            } finally {
                restore();
            }
        });
    });

    describe("getBoolean", () => {
        it("'true' 返回 true", () => {
            const restore = withEnv("FLAG", "true");
            try {
                expect(config.getBoolean("FLAG")).toBe(true);
            } finally {
                restore();
            }
        });

        it("'1' 返回 true", () => {
            const restore = withEnv("FLAG", "1");
            try {
                expect(config.getBoolean("FLAG")).toBe(true);
            } finally {
                restore();
            }
        });

        it("'yes' 返回 true", () => {
            const restore = withEnv("FLAG", "yes");
            try {
                expect(config.getBoolean("FLAG")).toBe(true);
            } finally {
                restore();
            }
        });

        it("不区分大小写", () => {
            for (const v of ["TRUE", "YES", "True", "Yes"]) {
                const restore = withEnv("FLAG", v);
                try {
                    expect(config.getBoolean("FLAG")).toBe(true);
                } finally {
                    restore();
                }
            }
        });

        it("'false' 返回 false", () => {
            const restore = withEnv("FLAG", "false");
            try {
                expect(config.getBoolean("FLAG")).toBe(false);
            } finally {
                restore();
            }
        });

        it("'0' 返回 false", () => {
            const restore = withEnv("FLAG", "0");
            try {
                expect(config.getBoolean("FLAG")).toBe(false);
            } finally {
                restore();
            }
        });

        it("未设置返回默认值", () => {
            expect(config.getBoolean("NOT_SET_B", true)).toBe(true);
            expect(config.getBoolean("NOT_SET_B2")).toBe(false);
        });

        it("空串返回默认值", () => {
            const restore = withEnv("EMPTY_B", "");
            try {
                expect(config.getBoolean("EMPTY_B", true)).toBe(true);
                expect(config.getBoolean("EMPTY_B")).toBe(false);
            } finally {
                restore();
            }
        });
    });
});
