import "./order_base";

message Request {
    nft_address: Address;
    order_jetton_buy_wallet: Address;
    nft_owner_address: Address;
    jetton_buy_master: Address;
    amount_buy: Int as coins;

    timeout: Int as uint64 = 0;
}

contract Order with OrderBase {
    seller: Address;

    request: Request = Request {
        nft_address: newAddress(0,0),
        order_jetton_buy_wallet: newAddress(0,0),
        nft_owner_address: newAddress(0,0),
        jetton_buy_master: newAddress(0,0),
        amount_buy: 0,

        timeout: 0,
    };

    open: Bool = false;
    filled: Bool = false;

    init(seller: Address, nonce: Int) {
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

    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);

        basicJettonTransfer(self.request.order_jetton_sell_wallet, self.seller, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }
}
