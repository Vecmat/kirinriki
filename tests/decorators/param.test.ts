import "reflect-metadata";
import {
    InjectParams,
    ParamsQuery,
    ParamsPath,
    ParamsBody,
    ParamsHeader,
    Ctx,
    type ParamDefinition,
} from "../../src/decorators/param";
import { container } from "../../src/core/container";
import { TAGGED_PARAM } from "../../src/core/define";
import { resetGlobals } from "../helpers/reset";

function applyParamDecorator(
    dec: ParameterDecorator,
    target: any,
    key: string | undefined,
    index: number,
): void {
    dec(target, key, index);
}

describe("Param 装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("InjectParams", () => {
        it("写入 TAGGED_PARAM：fn/index/type/isDto/dtoClass/source", () => {
            class Ctrl {
                m(@InjectParams("X", () => 1, { source: "query" }) _p: unknown) {}
            }
            const metas = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            const def = metas[0].data;
            expect(def.name).toBe("m");
            expect(def.index).toBe(0);
            expect(def.source).toBe("query");
            expect(def.isDto).toBe(false);
            expect(typeof def.fn).toBe("function");
        });

        it("DTO 类参数：isDto=true 且 dtoClass 指向该类", () => {
            class Dto {
                name!: string;
            }
            class Ctrl {
                m(@InjectParams("D", () => ({})) _p: Dto) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(def.isDto).toBe(true);
            expect(def.dtoClass).toBe(Dto);
        });

        it("基础类型不视为 DTO", () => {
            class Ctrl {
                m(
                    @InjectParams("S", () => "x") _p: string,
                    @InjectParams("N", () => 1) _p2: number,
                ) {}
            }
            const metas = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            );
            expect(metas[0].data.isDto).toBe(false);
            expect(metas[1].data.isDto).toBe(false);
        });

        it("propertyKey 为 undefined 时使用空串", () => {
            class Ctrl {
                constructor(@InjectParams("C", () => 0) _p: unknown) {}
            }
            const metas = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            );
            // 构造器参数无 propertyKey
            expect(metas[0].propertyKey).toBe("");
            expect(metas[0].data.name).toBe("");
        });

        it("多参数按 index 写入", () => {
            class Ctrl {
                m(
                    @InjectParams("A", () => "a") _a: unknown,
                    @InjectParams("B", () => "b") _b: unknown,
                ) {}
            }
            const metas = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            );
            const byIndex = new Map(metas.map((m) => [m.data.index, m.data]));
            expect(byIndex.get(0)?.fn(undefined as never, 0)).toBe("a");
            expect(byIndex.get(1)?.fn(undefined as never, 1)).toBe("b");
        });
    });

    describe("ParamsQuery", () => {
        it("按 name 提取单个 query 参数", async () => {
            const ctx = {
                req: {
                    query: (name?: string) =>
                        name === "q" ? "hello" : undefined,
                },
            };
            class Ctrl {
                m(@ParamsQuery("q") _q: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toBe("hello");
            expect(def.source).toBe("query");
        });

        it("无 name 时返回整个 query 对象", async () => {
            const ctx = {
                req: { query: () => ({ a: 1, b: 2 }) },
            };
            class Ctrl {
                m(@ParamsQuery() _q: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toEqual({ a: 1, b: 2 });
        });
    });

    describe("ParamsPath", () => {
        it("按 name 提取路径参数", async () => {
            const ctx = {
                req: { param: (name?: string) => (name === "id" ? "42" : undefined) },
            };
            class Ctrl {
                m(@ParamsPath("id") _id: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toBe("42");
            expect(def.source).toBe("path");
        });

        it("无 name 时返回全部路径参数对象", async () => {
            const ctx = { req: { param: () => ({ id: "1" }) } };
            class Ctrl {
                m(@ParamsPath() _p: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toEqual({ id: "1" });
        });
    });

    describe("ParamsBody", () => {
        it("提取整个 body 对象", async () => {
            const ctx = {
                req: { json: async () => ({ a: 1 }) },
            };
            class Ctrl {
                m(@ParamsBody() _b: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toEqual({ a: 1 });
            expect(def.source).toBe("body");
        });

        it("按 name 提取 body 字段", async () => {
            const ctx = {
                req: { json: async () => ({ name: "alice" }) },
            };
            class Ctrl {
                m(@ParamsBody("name") _n: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toBe("alice");
        });

        it("JSON 解析失败回退空对象", async () => {
            const ctx = {
                req: { json: async () => Promise.reject(new Error("x")) },
            };
            class Ctrl {
                m(@ParamsBody() _b: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toEqual({});
        });

        it("JSON 解析失败 + 按字段取值时返回 undefined", async () => {
            const ctx = {
                req: { json: async () => Promise.reject(new Error("x")) },
            };
            class Ctrl {
                m(@ParamsBody("foo") _b: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toBeUndefined();
        });
    });

    describe("ParamsHeader", () => {
        it("按 name 提取请求头", async () => {
            const ctx = {
                req: { header: (name?: string) => (name === "x-token" ? "abc" : undefined) },
            };
            class Ctrl {
                m(@ParamsHeader("x-token") _t: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toBe("abc");
            expect(def.source).toBe("header");
        });

        it("无 name 时返回全部请求头", async () => {
            const ctx = {
                req: { header: () => ({ "x-a": "1", "x-b": "2" }) },
            };
            class Ctrl {
                m(@ParamsHeader() _h: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toEqual({ "x-a": "1", "x-b": "2" });
        });
    });

    describe("Ctx", () => {
        it("返回 ctx 本身", async () => {
            const ctx = { marker: 1 };
            class Ctrl {
                m(@Ctx() _c: unknown) {}
            }
            const def = container.listPropertyData<ParamDefinition>(
                TAGGED_PARAM,
                Ctrl.prototype,
            )[0].data;
            expect(await def.fn(ctx, 0)).toBe(ctx);
            expect(def.source).toBe("ctx");
        });
    });
});
