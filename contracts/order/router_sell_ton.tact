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

    receive (notify: TonTransferNotification){
        let seller = context().sender;
        let request = notify.request;
        let initData = notify.initData;

        nativeThrowUnless(invalid_seller, seller == initData.seller);

        let orderInit = initOf OrderSellTon(initData);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

        send(SendParameters{
            to: self.owner,
            value: self.fee,
            bounce: false,
            mode: SendIgnoreErrors | SendPayGasSeparately,
            body: null,
        });

        send(SendParameters{
            to: orderAddress,
            value: 0,
            bounce: true,
            mode: SendIgnoreErrors | SendRemainingBalance,
            body: request.toCell(),
            code: orderInit.code,
            data: orderInit.data
        });
    }

    override get fun calculate_order(initData: InitData): Address {
        let orderInit = initOf OrderSellTon(initData);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
