import {
    App,
    Autowired,
    Service,
    createAppDecorators,
} from "@vecmat/kirinriki";

/**
 * Test 应用 —— 单文件应用示例。
 *
 * 全部代码（应用声明、服务、控制器）收敛在这一个 index.ts 中，
 * 体现框架的灵活性：小型应用无需目录结构与文件拆分，
 * createAppDecorators 也可内联调用，无需单独的 base/decorators.ts。
 */

// 内联调用工厂：@Controller 自动绑定 app: "test"
const { Controller, Get } = createAppDecorators("test");

@App({ name: "test", basePath: "/test" })
export class TestApp {}

@Service()
export class TestService {
    private count = 0;

    /** 记录并返回调用次数 */
    hit(): { count: number; at: string } {
        this.count += 1;
        return { count: this.count, at: new Date().toISOString() };
    }
}

@Controller("/")
export class TestController {
    @Autowired(TestService)
    private testService!: TestService;

    /** 探活接口：GET /test/ping */
    @Get("/ping")
    ping() {
        return { pong: true, ...this.testService.hit() };
    }
}
