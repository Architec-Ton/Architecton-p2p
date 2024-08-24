import "./order_sell_ton";
import "./router_base";

message TonTransferNotification {
    request: Request;
    initData: InitData;
}

contract RouterSellTon with RouterBase {
    owner: Address;
    fee: Int;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    receive (notify: TonTransferNotification) {
        let seller = context().sender;

        let orderInit = initOf OrderSellTon(notify.initData);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

        send(SendParameters{
            to: self.owner,
            value: self.fee,
            mode: SendIgnoreErrors | SendPayGasSeparately,
        });

        send(SendParameters{
            to: orderAddress,
            value: 0,
            mode: SendIgnoreErrors | SendRemainingBalance,
            body: notify.request.toCell(),
            code: orderInit.code,
            data: orderInit.data
        });
    }

    override get fun calculate_order(initData: InitData): Address {
        let orderInit = initOf OrderSellTon(initData);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
