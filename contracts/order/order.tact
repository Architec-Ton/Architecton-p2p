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
    type: Int as uint8 = 0;

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

    init(seller: Address, nonce: Int) {
        self.router = context().sender;
        self.seller = seller;
    }

    // @notice Receive request message, validate and set request data
    // @param request - request message with necessary params
    receive(request: Request) {
        nativeThrowUnless(access_denided, context().sender == self.router);
        nativeThrowUnless(order_already_filled, !self.filled);

        self.request = request;

        self.filled = true;
    }

    // @notice Receive Jetton Transfer Notification message, validate and open order or close and send jettons
    receive(notify: JettonTransferNotification) {
        if(!self.SmartThrow(order_not_filled, self.filled, notify.sender, notify.amount)) {return;}
        let sender: Address = context().sender;

        // open if transfer from seller
        if (sender == self.request.order_jetton_sell_wallet) {
            if(!self.SmartThrow(access_denided, notify.sender == self.router, notify.sender, notify.amount)) {return;}
            if(!self.SmartThrow(order_already_opened, !self.open, self.seller, notify.amount)) {return;}
            if(!self.SmartThrow(invalid_jetton_amount, notify.amount == self.request.amount_sell, self.seller, notify.amount)) {return;}

            self.open = true;
        }

        // send jettons if transfer from anybody
        else if (sender == self.request.order_jetton_buy_wallet) {
            if(!self.SmartThrow(order_not_opened, self.open, notify.sender, notify.amount)) {return;}
            if(!self.SmartThrow(invalid_timeout, self.request.timeout > now(), notify.sender, notify.amount)) {return;}
            if(!self.SmartThrow(invalid_jetton_amount, notify.amount == self.request.amount_buy, notify.sender, notify.amount)) {return;}

            basicJettonTransfer(self.request.order_jetton_buy_wallet, self.seller, self.request.amount_buy, 0, SendIgnoreErrors);
            basicJettonTransfer(self.request.order_jetton_sell_wallet, notify.sender, self.request.amount_sell, 0, SendIgnoreErrors);

            self.withdraw()
        }

        // try withdraw if from error jetton wallet
        else {
            if(!self.SmartThrow(invalid_address, false, notify.sender, notify.amount)) {return;}
        }
    }

    // @notice Receive cancel message, validate and send jettons and withdraw to seller
    // @param cancel - request message with necessary params
    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);
        nativeThrowUnless(not_enough_ton, myBalance() >= jetton_transfer_fee);

        basicJettonTransfer(self.request.order_jetton_sell_wallet, self.seller, self.request.amount_sell, 0, SendIgnoreErrors);

        self.withdraw()
    }
}
