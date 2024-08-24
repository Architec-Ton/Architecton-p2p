import "./order_base";

message Request {
    seller: Address;
    order_jetton_buy_wallet: Address;
    jetton_buy_master: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;

    timeout: Int;
}

contract OrderSellTon with OrderBase {
    router: Address;

    request: Request = Request {
        seller: newAddress(0,0),
        order_jetton_buy_wallet: newAddress(0,0),
        jetton_buy_master: newAddress(0,0),
        amount_sell: 0,
        amount_buy: 0,

        timeout: 0,
    };

    open: Bool = false;

    init(router: Address, nonce: Int) {
        nativeThrowUnless(invalid_router, context().sender == router);

        self.router = router;
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

        basicJettonTransfer(self.request.order_jetton_buy_wallet, self.request.seller, self.request.amount_buy, 0, SendIgnoreErrors);

        send(SendParameters{
            to: buyer,
            value: self.request.amount_sell,
            bounce: true,
            mode: SendIgnoreErrors + SendPayGasSeparately,
        });

        self.withdraw()
    }

    receive("cancel") {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.request.seller);

        self.withdraw()
    }
}
