import "./order_base";
import "./NftMessages";

contract OrderSellNft with OrderBase {
    seller: Address;
    router: Address;
    type: Int as uint8 = 3;

    request: Request = Request {
        nft_address: newAddress(0,0),
        order_jetton_buy_wallet: newAddress(0,0),
        jetton_buy_master: newAddress(0,0),
        amount_buy: 0,

        expiration_time: 0,
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

    receive(notify: NftTransferNotification) {
        if(!SmartThrowNft(invalid_address, context().sender == self.request.nft_address, self.seller)){ return;}
        if(!SmartThrowNft(order_not_filled, self.filled, self.seller)){return;}
        if(!SmartThrowNft(order_already_opened, !self.open, self.seller)){return;}
        if(!SmartThrowNft(access_denided, notify.forward_payload.loadAddress() == self.router, self.seller)){return;}

        self.open = true;
    }

    receive(notify: JettonTransferNotification) {
        if (!SmartThrow(order_not_opened, self.open, notify.sender, notify.amount)) {return;}
        if (!SmartThrow(invalid_address, context().sender == self.request.order_jetton_buy_wallet, notify.sender, notify.amount)) {return;}
        if (!SmartThrow(invalid_expiration_time, self.request.expiration_time > now(), notify.sender, notify.amount)) {return;}
        if (!SmartThrow(invalid_jetton_amount, notify.amount == self.request.amount_buy, notify.sender, notify.amount)) {return;}

        send_nft(nft_transfer_fee, self.request.nft_address, notify.sender, self.seller, 0);
        basicJettonTransfer(self.request.order_jetton_buy_wallet, self.seller, self.request.amount_buy, 0);

        self.withdraw()
    }

    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);
        send_nft(nft_transfer_fee, self.request.nft_address, self.seller, self.seller, 0);

        self.withdraw()
    }
}
