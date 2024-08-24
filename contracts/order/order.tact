import "./order_base";

message Request {
    order_jetton_sell_wallet: Address;
    order_jetton_buy_wallet: Address;
    jetton_sell_master: Address;
    jetton_buy_master: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;

    timeout: Int as uint64 = 0;
}

contract Order with OrderBase {
    seller: Address;
    router: Address;

    request: Request = Request {
        order_jetton_sell_wallet: newAddress(0,0),
        order_jetton_buy_wallet: newAddress(0,0),
        jetton_sell_master: newAddress(0,0),
        jetton_buy_master: newAddress(0,0),
        amount_sell: 0,
        amount_buy: 0,

        timeout: 0,
    };

    open: Bool = false;
    filled: Bool = false;

    init(initData: InitData) {
        self.router = context().sender;
        self.seller = initData.seller;
    }

    receive(request: Request) {
        nativeThrowUnless(access_denided, context().sender == self.router);
        nativeThrowUnless(order_already_filled, !self.filled);

        self.request = request;

        self.filled = true;
    }

    receive(notify: JettonTransferNotification) {
        nativeThrowUnless(order_not_filled, self.filled);
        let sender: Address = context().sender;

        if (sender == self.request.order_jetton_sell_wallet) {
            nativeThrowUnless(order_already_opened, !self.open);
            nativeThrowUnless(access_denided, notify.sender == self.router);
            nativeThrowUnless(invalid_jetton_amount, notify.amount == self.request.amount_sell);

            self.open = true;
        } else if (sender == self.request.order_jetton_buy_wallet) {
            nativeThrowUnless(order_not_opened, self.open);
            nativeThrowUnless(invalid_timeout, self.request.timeout > now());
            nativeThrowUnless(invalid_jetton_amount, notify.amount == self.request.amount_buy);

            basicJettonTransfer(self.request.order_jetton_buy_wallet, self.seller, self.request.amount_buy, 0, SendIgnoreErrors);
            basicJettonTransfer(self.request.order_jetton_sell_wallet, notify.sender, self.request.amount_sell, 0, SendIgnoreErrors);

            self.withdraw()
        } else {
            throw(invalid_address);
        }
    }

    receive("cancel") {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);

        basicJettonTransfer(self.request.order_jetton_sell_wallet, self.seller, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }
}
