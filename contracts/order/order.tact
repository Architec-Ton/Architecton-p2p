message Request {
    my_jetton_sell_wallet: Address;
    my_jetton_buy_wallet: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;
}

message(0x7362d09c) JettonTransferNotification {
    query_id: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    sender: Address;                        // address of the sender of the jettons
    forward_payload: Slice as remaining;    // optional custom payload
}

message(0x0f8a7ea5) JettonTransfer {
    query_id: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    destination: Address;                   // address of the new seller of the jettons
    response_destination: Address;          // address where to send a response with confirmation of a successful transfer and the rest of the incoming message Toncoins.
    custom_payload: Cell?;                  // optional custom payload
    forward_ton_amount: Int as coins;       // the amount of nanotons to be sent to the destination address.
    forward_payload: Slice?;    // optional custom data that should be sent to the destination address.
}

const jetton_transfer_fee: Int = ton("0.018586"); // ~ 0.04 TON, medium fee for any amount of Jetton is 0.037 TON - docs
const invalid_address: Int = 136;
const access_denided: Int = 132;
const order_closed: Int = 133;
const invalid_jetton_amount: Int = 39;
const order_not_opened: Int = 40;
const order_already_opened: Int = 41;

contract Order {
    seller: Address;

    my_jetton_buy_wallet: Address = newAddress(0,0);
    my_jetton_sell_wallet: Address = newAddress(0,0);

    amount_sell: Int = 0;
    amount_buy: Int = 0;

    open: Bool = false;
    close: Bool = false;

    init(seller: Address, time: Int) {
//        let jetton_buy_seller_wallet: Address = calculateJettonWalletAddress(seller, request.jetton_buy_master, request.jetton_buy_code);
//        let jetton_sell_seller_wallet: Address = calculateJettonWalletAddress(seller, request.jetton_sell_master, request.jetton_sell_code);

//        dump(jetton_sell_seller_wallet);
//        dump(jetton_buy_seller_wallet);

        self.seller = seller;
    }

    receive(request: Request) {
        nativeThrowUnless(order_already_opened, !self.close && !self.open);

        self.my_jetton_buy_wallet = request.my_jetton_buy_wallet;
        self.my_jetton_sell_wallet = request.my_jetton_sell_wallet;

        self.amount_sell = request.amount_sell;
        self.amount_buy = request.amount_buy;
    }

    receive(notify: JettonTransferNotification) {
        nativeThrowUnless(order_closed, !self.close);

        let sender: Address = context().sender;

        if (sender == self.my_jetton_sell_wallet) {
            nativeThrowUnless(order_already_opened, !self.open);
            nativeThrowUnless(access_denided, notify.sender == self.seller);
            nativeThrowUnless(invalid_jetton_amount, notify.amount == self.amount_sell);
            self.open = true;
        } else if (sender == self.my_jetton_buy_wallet) {
            nativeThrowUnless(order_not_opened, self.open);
            nativeThrowUnless(invalid_jetton_amount, notify.amount == self.amount_buy);

            let buyer: Address = notify.sender;

            send(SendParameters{
                to: self.my_jetton_buy_wallet,
                value: jetton_transfer_fee,
                bounce: true,
                mode: SendIgnoreErrors,
                body: JettonTransfer {
                    query_id: 0,
                    amount: self.amount_buy,
                    destination: self.seller,
                    response_destination: self.seller,
                    custom_payload: null,
                    forward_payload: null,
                    forward_ton_amount: 0
                }.toCell()
            });

            send(SendParameters{
                to: self.my_jetton_sell_wallet,
                value: jetton_transfer_fee,
                bounce: true,
                mode: SendIgnoreErrors,
                body: JettonTransfer {
                    query_id: 0,
                    amount: self.amount_sell,
                    destination: buyer,
                    response_destination: buyer,
                    custom_payload: null,
                    forward_payload: null,
                    forward_ton_amount: 0
                }.toCell()
            });

            self.open = false; self.close = true; // if no terminating, else send mode 128 + 32
        } else {
            throw(invalid_address);
        }
    }

    receive("cancel") {
        nativeThrowUnless(order_closed, self.open && !self.close);
        nativeThrowUnless(access_denided, context().sender == self.seller);

        send(SendParameters{
            to: self.my_jetton_sell_wallet,
            value: jetton_transfer_fee,
            bounce: true,
            mode: SendIgnoreErrors,
            body: JettonTransfer {
                query_id: 0,
                amount: self.amount_sell,
                destination: self.seller,
                response_destination: self.seller,
                custom_payload: null,
                forward_payload: null,
                forward_ton_amount: 0
            }.toCell()
        });

        self.open = false;
        self.close = true;
    }

    // todo: getters(what?), own calculate function, fees (maybe remValue to seller)
}
