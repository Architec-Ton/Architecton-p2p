import "./order_base";
import "./NftMessages";

contract OrderSellNft with OrderBase {
    seller: Address;
    router: Address;

    request: Request = Request {
        nft_address: newAddress(0,0),
        order_jetton_buy_wallet: newAddress(0,0),
        jetton_buy_master: newAddress(0,0),
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

    receive(notify: NftTransferNotification) {
        nativeThrowUnless(order_not_filled, self.filled);
        nativeThrowUnless(order_already_opened, !self.open);
        nativeThrowUnless(invalid_address, context().sender == self.request.nft_address);
        nativeThrowUnless(access_denided, notify.forward_payload.loadAddress() == self.router);

        self.open = true;
    }

    receive(notify: JettonTransferNotification) {
        nativeThrowUnless(order_not_opened, self.open);
        nativeThrowUnless(invalid_address, context().sender == self.request.order_jetton_buy_wallet);
        nativeThrowUnless(invalid_timeout, self.request.timeout > now());
        nativeThrowUnless(invalid_jetton_amount, notify.amount == self.request.amount_buy);

        send_nft(nft_transfer_fee, self.request.nft_address, notify.sender, self.seller, 0);
        basicJettonTransfer(self.request.order_jetton_buy_wallet, self.seller, self.request.amount_buy, 0, SendIgnoreErrors);

        self.withdraw()
    }

    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);
        send_nft(nft_transfer_fee, self.request.nft_address, self.seller, self.seller, 0);

        self.withdraw()
    }
}
