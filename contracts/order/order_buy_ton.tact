import "./order_base";

message Request {
    order_jetton_sell_wallet: Address;
    jetton_sell_master: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;

    timeout: Int as uint64 = 0;
}

contract OrderBuyTon with OrderBase {
    seller: Address;
    router: Address;
    type: Int as uint8 = 1;

    request: Request = Request {
        order_jetton_sell_wallet: newAddress(0,0),
        jetton_sell_master: newAddress(0,0),
        amount_sell: 0,
        amount_buy: 0,

        timeout: 0,
    };

    open: Bool = false;
    filled: Bool = false;

    init(seller: Address, nonce: Int) {
        self.router = context().sender;
        self.seller = seller;
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
            to: self.seller,
            value: self.request.amount_buy,
            bounce: true,
            mode: SendIgnoreErrors + SendPayGasSeparately,
        });

        basicJettonTransfer(self.request.order_jetton_sell_wallet, buyer, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }

    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);

        basicJettonTransfer(self.request.order_jetton_sell_wallet, self.seller, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }
}
