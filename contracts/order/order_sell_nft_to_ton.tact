import "./order_base";
import "./NftMessages";

message Request {
    nft_address: Address;
    amount_buy: Int as coins;

    expiration_time: Int as uint64 = 0;
}

contract OrderSellNftToTon with OrderBase {
    seller: Address;
    router: Address;
    type: Int as uint8 = 3;

    request: Request = Request {
        nft_address: newAddress(0,0),
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

    receive("transfer ton") {
        let ctx = context();

        if (!self.open || ctx.value < self.request.amount_buy || self.request.expiration_time < now()) {
            send(SendParameters{
                to: context().sender,
                value: 0,
                bounce: true,
                mode: SendRemainingValue,
            });
            return;
        }

        let buyer: Address = ctx.sender;
        send(SendParameters{
            to: self.seller,
            value: self.request.amount_buy,
            bounce: true,
            mode: SendIgnoreErrors + SendPayGasSeparately,
        });

        send_nft(nft_transfer_fee, self.request.nft_address, buyer, self.seller, 0);

        self.withdraw()
    }

    receive(cancel: Cancel) {
        nativeThrowUnless(order_closed, self.open);
        nativeThrowUnless(access_denided, context().sender == self.seller);
        send_nft(nft_transfer_fee, self.request.nft_address, self.seller, self.seller, 0);

        self.withdraw()
    }
}
