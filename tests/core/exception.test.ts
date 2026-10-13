import "reflect-metadata";
import {
    Exception,
    createException,
} from "../../src/core/exception";

describe("Exception", () => {
    describe("构造", () => {
        it("仅传 errorKey：message/errorMessage 取 errorKey，status 默认 500", () => {
            const err = new Exception("API_DEMO_ERROR");
            expect(err).toBeInstanceOf(Error);
            expect(err.errorKey).toBe("API_DEMO_ERROR");
            expect(err.errorMessage).toBe("API_DEMO_ERROR");
            expect(err.status).toBe(500);
            expect(err.message).toBe("API_DEMO_ERROR");
        });

        it("显式 message 与 status", () => {
            const err = new Exception("API_USER_NOT_FOUND", "用户不存在", 404);
            expect(err.errorKey).toBe("API_USER_NOT_FOUND");
            expect(err.errorMessage).toBe("用户不存在");
            expect(err.status).toBe(404);
            expect(err.message).toBe("用户不存在");
        });

        it("status 默认值 500 可被 0 覆盖", () => {
            const err = new Exception("X", "msg", 0);
            expect(err.status).toBe(0);
        });
    });

    describe("createException 工厂", () => {
        it("等价于直接 new Exception", () => {
            const a = new Exception("K", "m", 400);
            const b = createException("K", "m", 400);
            expect(b).toBeInstanceOf(Exception);
            expect(b.errorKey).toBe(a.errorKey);
            expect(b.errorMessage).toBe(a.errorMessage);
            expect(b.status).toBe(a.status);
        });

        it("缺省参数与构造器一致", () => {
            const b = createException("ONLY_KEY");
            expect(b.errorMessage).toBe("ONLY_KEY");
            expect(b.status).toBe(500);
        });
    });
});
