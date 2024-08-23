import "./order_sell_ton";

const deploy_fee: Int = ton("0.01");
const invalid_seller: Int = 45;

message TonTransferNotification {
    request: Request;
    initData: InitData;
}

message NewOwner {
    new_owner: Address;
}

message NewFee {
    new_fee: Int;
}

contract RouterSellTon {
    owner: Address;
    fee: Int;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    receive() {}

    receive(msg: NewOwner) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.owner = msg.new_owner;
    }

    receive(msg: NewFee) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.fee = msg.new_fee;
    }

    receive (notify: TonTransferNotification){
        let seller = context().sender;
        let request = notify.request;
        dump(request.amount_sell);
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

    get fun owner(): Address {
        return self.owner
    }

    get fun fee(): Int {
        return self.fee
    }
}
