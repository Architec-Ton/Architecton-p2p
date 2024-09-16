import "./order_base";

message Request {
    order_jetton_buy_wallet: Address;
    jetton_buy_master: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;

    timeout: Int as uint64 = 0;
}

contract OrderSellTon with OrderBase {
    seller: Address;
    router: Address;

    request: Request = Request {
        order_jetton_buy_wallet: newAddress(0,0),
        jetton_buy_master: newAddress(0,0),
        amount_sell: 0,
        amount_buy: 0,

        timeout: 0,
    };

    open: Bool = false;

    init(seller: Address, nonce: Int) {
        self.router = context().sender;
        self.seller = seller;
    }

    receive(request: Request) {
        let ctx = context();
        nativeThrowUnless(access_denided, ctx.sender == self.router);
        nativeThrowUnless(order_already_opened, !self.open);
        nativeThrowUnless(not_enough_ton, ctx.value >= request.amount_sell);

        self.request = request;

        self.open = true;
    }

    receive(notify: JettonTransferNotification) {
        nativeThrowUnless(order_not_opened, self.open);
        nativeThrowUnless(invalid_address, context().sender == self.request.order_jetton_buy_wallet);
        nativeThrowUnless(invalid_timeout, self.request.timeout > now());
        nativeThrowUnless(invalid_jetton_amount, notify.amount == self.request.amount_buy);

        let buyer: Address = notify.sender;

        basicJettonTransfer(self.request.order_jetton_buy_wallet, self.seller, self.request.amount_buy, 0, SendIgnoreErrors);

        send(SendParameters{
            to: buyer,
            value: self.request.amount_sell,
            bounce: true,
            mode: SendIgnoreErrors + SendPayGasSeparately,
        });

        self.withdraw()
    }

    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);

        self.withdraw()
    }
}
