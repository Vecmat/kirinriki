import "reflect-metadata";
import { z } from "zod";
import {
    Valid,
    Validated,
    validateWithSchema,
    type ValidatorDefinition,
    type SchemaDefinition,
} from "../../src/decorators/validation";
import { container } from "../../src/core/container";
import {
    PARAM_VALIDATOR_KEY,
    VALIDATE_SCHEMA_KEY,
} from "../../src/core/define";
import { Exception } from "../../src/core/exception";
import { resetGlobals } from "../helpers/reset";

function applyParam(
    dec: ParameterDecorator,
    target: any,
    key: string | undefined,
    index: number,
) {
    dec(target, key, index);
}

function applyMethod(dec: MethodDecorator, target: any, key: string) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key) || {
        value: function () {},
        writable: true,
        configurable: true,
        enumerable: false,
    };
    dec(target, key, descriptor);
}

describe("Validation 装饰器", () => {
    beforeEach(() => resetGlobals());

    describe("@Valid", () => {
        it("写入 PARAM_VALIDATOR_KEY：index/validator/message", () => {
            class Ctrl {
                m(@Valid((v: any) => !!v, { message: "必填" }) _p: unknown) {}
            }
            const metas = container.listPropertyData<ValidatorDefinition>(
                PARAM_VALIDATOR_KEY,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            expect(metas[0].data.index).toBe(0);
            expect(metas[0].data.message).toBe("必填");
            expect(metas[0].data.validator(null)).toBe(false);
            expect(metas[0].data.validator("x")).toBe(true);
        });

        it("message 默认 'Validation failed'", () => {
            class Ctrl {
                m(@Valid(() => true) _p: unknown) {}
            }
            const meta = container.listPropertyData<ValidatorDefinition>(
                PARAM_VALIDATOR_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.data.message).toBe("Validation failed");
        });

        it("propertyKey 为 undefined 时使用空串", () => {
            class Ctrl {
                constructor(@Valid(() => true) _p: unknown) {}
            }
            const meta = container.listPropertyData<ValidatorDefinition>(
                PARAM_VALIDATOR_KEY,
                Ctrl.prototype,
            )[0];
            expect(meta.propertyKey).toBe("");
        });
    });

    describe("@Validated", () => {
        it("写入 VALIDATE_SCHEMA_KEY：schema", () => {
            const schema = z.object({ name: z.string() });
            class Ctrl {
                m() {}
            }
            applyMethod(Validated(schema), Ctrl.prototype, "m");
            const metas = container.listPropertyData<SchemaDefinition>(
                VALIDATE_SCHEMA_KEY,
                Ctrl.prototype,
            );
            expect(metas).toHaveLength(1);
            expect(metas[0].data.schema).toBe(schema);
        });

        it("返回原 descriptor", () => {
            const schema = z.object({});
            class Ctrl {
                m() {}
            }
            const descriptor = {
                value: function () {},
                writable: true,
                configurable: true,
                enumerable: false,
            };
            const ret = Validated(schema)(Ctrl.prototype, "m", descriptor);
            expect(ret).toBe(descriptor);
        });
    });

    describe("validateWithSchema", () => {
        it("校验通过：返回 result.data", () => {
            const schema = z.object({ name: z.string() });
            const out = validateWithSchema(schema, { name: "alice" });
            expect(out).toEqual({ name: "alice" });
        });

        it("校验失败：抛 Exception(VALIDATION_ERROR, ..., 400)", () => {
            const schema = z.object({ name: z.string().min(1) });
            expect(() => validateWithSchema(schema, { name: "" })).toThrow(
                Exception,
            );
            try {
                validateWithSchema(schema, { name: "" });
            } catch (e) {
                const ex = e as Exception;
                expect(ex.errorKey).toBe("VALIDATION_ERROR");
                expect(ex.status).toBe(400);
                expect(ex.errorMessage).toContain("name");
            }
        });

        it("message 拼接多个 issue", () => {
            const schema = z.object({
                a: z.string().min(1),
                b: z.string().min(1),
            });
            try {
                validateWithSchema(schema, { a: "", b: "" });
            } catch (e) {
                const ex = e as Exception;
                expect(ex.errorMessage).toContain("a");
                expect(ex.errorMessage).toContain("b");
                expect(ex.errorMessage).toContain(";");
            }
        });
    });
});
