import { Controller } from "../../src/decorators/component";
import { Get, Post, Put, Delete } from "../../src/decorators/route";
import { ParamsQuery, ParamsPath, ParamsBody, ParamsHeader, Ctx } from "../../src/decorators/param";
import { Autowired } from "../../src/decorators/component";
import { Before, After } from "../../src/decorators/aop";
import { Exception, Catched } from "../../src/decorators/exception";
import { Valid, Validated } from "../../src/decorators/validation";
import { UserService, UserSchema, User } from "../service/user.service";

@Controller("/user")
export class UserController {
    @Autowired()
    userService!: UserService;

    @Get("/")
    async list() {
        return this.userService.list();
    }

    @Before("test")
    async before() {
        console.log("Before");
    }

    @After("test")
    async after() {
        console.log("After");
    }

    @Get("/:id")
    async getById(
        @ParamsPath("id") id: string,
        @ParamsHeader("x-token") @Valid((v) => !!v, { message: "Token missing" }) token: string
    ) {
        return this.userService.findById(id);
    }

    @Post("/")
    @Validated(UserSchema)
    async create(@ParamsBody() user: User) {
        return this.userService.create(user);
    }

    @Put("/:id")
    async update(@ParamsPath("id") id: string, @ParamsBody() user: Partial<User>) {
        return { id, ...user };
    }

    @Delete("/:id")
    async delete(@ParamsPath("id") id: string) {
        return { deleted: id };
    }

    @Post("/test")
    @Exception("API_DEMO_ERROR", "用户创建失败")
    async test() {
        throw new Error("something unexpected happened");
    }

    @Catched("API_*")
    async catchApiError(err: any, ctx: any) {
        console.log("Caught API error:", err.errorKey, err.errorMessage);
        return { caught: true, errorKey: err.errorKey, message: err.errorMessage };
    }
}
