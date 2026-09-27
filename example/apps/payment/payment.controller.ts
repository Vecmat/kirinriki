import { Autowired, Exception, Logger } from "@vecmat/kirinriki";
import {
    Ctx,
    Controller,
    Get,
    Post,
    ParamsBody,
    ParamsPath,
} from "./decorators";
import type { Context } from "hono";
import { PaymentService } from "./payment.service";

/**
 * Payment 应用控制器。
 * 使用应用本地装饰器，@Controller 自动绑定 app: "payment"，
 * 路由自动拼接应用 basePath，最终为 /payment/*
 */
@Controller("/")
export class PaymentController {
    @Autowired(PaymentService)
    private paymentService!: PaymentService;

    @Autowired(Logger)
    private logger!: Logger;

    /** 创建支付订单：POST /payment/orders */
    @Post("/orders")
    async createOrder(
        @ParamsBody("userId") userId: string,
        @ParamsBody("amount") amount: number,
    ) {
        if (!userId || !amount || amount <= 0) {
            throw new Exception(
                "PAYMENT_INVALID_PARAMS",
                "无效的订单参数",
                400,
            );
        }
        const order = this.paymentService.createOrder(userId, amount);
        this.logger.info(`Order created: ${order.orderId}`);
        return order;
    }

    /** 查询订单状态：GET /payment/orders/:status */
    @Get("/orders/code")
    async getStatus(@Ctx() ctx: Context) {
        const code = ctx.req.query("code") as string;
        return { status: code || "123124" };
    }

    /** 查询订单状态：GET /payment/orders/:orderId */
    @Get("/orders/:orderId")
    async getOrder(@ParamsPath("orderId") orderId: string) {
        return this.paymentService.getOrderStatus(orderId);
    }
}
