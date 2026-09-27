import { Service, Autowired, Logger, Config } from "@vecmat/kirinriki";

/**
 * Payment 应用内部业务服务。
 * 约定：不跨应用引用，仅在 payment 应用内部使用。
 */
@Service()
export class PaymentService {
    @Autowired(Logger)
    private logger!: Logger;

    @Autowired(Config)
    private config!: Config;

    /** 模拟创建支付订单 */
    createOrder(
        userId: string,
        amount: number,
    ): { orderId: string; status: string; currency: string } {
        const orderId = "ORD-" + Date.now();
        this.logger.info(
            `PaymentService.createOrder: user=${userId}, amount=${amount}, order=${orderId}`,
        );
        const currency = this.config.getString("PAYMENT_CURRENCY", "CNY");
        return { orderId, status: "pending", currency };
    }

    /** 模拟查询订单状态 */
    getOrderStatus(orderId: string): { orderId: string; status: string } {
        return { orderId, status: "paid" };
    }
}
