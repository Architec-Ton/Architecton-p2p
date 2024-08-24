import "./order_sell_ton";
import "./router_base";

message TonTransferNotification {
    request: Request;
}

contract RouterSellTon with RouterBase {
    owner: Address;
    fee: Int;
    nonce: Int = 0;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    receive (request: Request){
        let seller = context().sender;

        let orderInit = initOf OrderSellTon(seller, myAddress(), self.nonce);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);
        self.nonce += 1;

        send(SendParameters{
            to: self.owner,
            value: self.fee,
            mode: SendIgnoreErrors | SendPayGasSeparately,
        });

        send(SendParameters{
            to: orderAddress,
            value: 0,
            mode: SendIgnoreErrors | SendRemainingBalance,
            body: request.toCell(),
            code: orderInit.code,
            data: orderInit.data
        });
    }

    override get fun calculate_order(seller: Address, nonce: Int): Address {
        nativeThrowUnless(invalid_nonce, nonce <= self.nonce);

        let orderInit = initOf OrderSellTon(seller, myAddress(), nonce);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
