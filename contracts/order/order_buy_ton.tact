import "./order_base";

message Request {
    seller: Address;
    order_jetton_sell_wallet: Address;
    jetton_sell_master: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;

    timeout: Int;
}

contract OrderBuyTon with OrderBase {
    router: Address;

    request: Request = Request {
        seller: newAddress(0,0),
        order_jetton_sell_wallet: newAddress(0,0),
        jetton_sell_master: newAddress(0,0),
        amount_sell: 0,
        amount_buy: 0,

        timeout: 0,
    };

    open: Bool = false;
    filled: Bool = false;

    init(router: Address, nonce: Int) {
        nativeThrowUnless(invalid_router, context().sender == router);

        self.router = router;
    }

    receive(request: Request) {
        nativeThrowUnless(access_denided, context().sender == self.router);
        nativeThrowUnless(order_already_filled, !self.filled);

        self.request = request;

        self.filled = true;
    }

    receive(notify: JettonTransferNotification) {
        nativeThrowUnless(order_not_filled, self.filled);
        nativeThrowUnless(order_already_opened, !self.open);
        nativeThrowUnless(access_denided, notify.sender == self.router);
        nativeThrowUnless(invalid_address, context().sender == self.request.order_jetton_sell_wallet);
        nativeThrowUnless(invalid_timeout, self.request.timeout > now());
        nativeThrowUnless(invalid_jetton_amount, notify.amount == self.request.amount_sell);

        self.open = true;
    }

    receive("transfer ton") {
        let ctx = context();
        nativeThrowUnless(order_not_opened, self.open);
        nativeThrowUnless(not_enough_ton, ctx.value >= self.request.amount_buy);

        let buyer: Address = ctx.sender;
        send(SendParameters{
            to: self.request.seller,
            value: self.request.amount_buy,
            bounce: true,
            mode: SendIgnoreErrors + SendPayGasSeparately,
        });

        basicJettonTransfer(self.request.order_jetton_sell_wallet, buyer, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }

    receive("cancel") {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.request.seller);

        basicJettonTransfer(self.request.order_jetton_sell_wallet, self.request.seller, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }
}
