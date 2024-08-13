import "./JettonMessages";

message Request {
    my_jetton_sell_wallet: Address;
    my_jetton_buy_wallet: Address;
    jetton_sell_master: Address;
    jetton_buy_master: Address;
    amount_sell: Int as coins;
    amount_buy: Int as coins;

    timeout: Int;
}

struct State {
    seller: Address;
    request: Request;
    open: Bool;
}

const jetton_transfer_fee: Int = ton("0.04"); // ~ 0.04 TON, medium fee for any amount of Jetton is 0.037 TON - docs
const invalid_address: Int = 136;
const access_denided: Int = 132;
const order_closed: Int = 133;
const invalid_jetton_amount: Int = 39;
const order_not_opened: Int = 40;
const order_already_opened: Int = 41;
const invalid_timeout: Int = 42;

contract Order {
    seller: Address;

    my_jetton_buy_wallet: Address = newAddress(0,0);
    my_jetton_sell_wallet: Address = newAddress(0,0);
    jetton_sell_master: Address = newAddress(0,0);
    jetton_buy_master: Address = newAddress(0,0);

    amount_sell: Int = 0;
    amount_buy: Int = 0;

    timeout: Int = 0;

    open: Bool = false;

    init(seller: Address, time: Int) {
        self.seller = seller;
    }

    receive(request: Request) {
        nativeThrowUnless(access_denided, context().sender == self.seller);
        nativeThrowUnless(order_already_opened, !self.open);

        self.my_jetton_sell_wallet = request.my_jetton_sell_wallet;
        self.my_jetton_buy_wallet = request.my_jetton_buy_wallet;

        self.jetton_sell_master = request.jetton_sell_master;
        self.jetton_buy_master = request.jetton_buy_master;

        self.amount_sell = request.amount_sell;
        self.amount_buy = request.amount_buy;

        self.timeout = request.timeout;
    }

    fun withdraw() {
        self.open = false;

        send(SendParameters{
            to: self.seller,
            value: 0,
            bounce: false,
            mode: SendRemainingBalance + SendDestroyIfZero,
            body: null,
        });
    }

    receive(notify: JettonTransferNotification) {
        let sender: Address = context().sender;

        if (sender == self.my_jetton_sell_wallet) {
            nativeThrowUnless(order_already_opened, !self.open);
            nativeThrowUnless(access_denided, notify.sender == self.seller);
            nativeThrowUnless(invalid_jetton_amount, notify.amount == self.amount_sell);
            self.open = true;
        } else if (sender == self.my_jetton_buy_wallet) {
            nativeThrowUnless(order_not_opened, self.open);
            nativeThrowUnless(invalid_timeout, self.timeout > now());
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

            self.withdraw()
        } else {
            throw(invalid_address);
        }
    }

    receive("cancel") {
        nativeThrowUnless(order_closed, self.open);
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

        self.withdraw()
    }

    get fun state(): State {
        return State {
            seller: self.seller,
            request: Request {
            my_jetton_sell_wallet: self.my_jetton_sell_wallet,
            my_jetton_buy_wallet: self.my_jetton_buy_wallet,
            jetton_sell_master: self.jetton_sell_master,
            jetton_buy_master: self.jetton_buy_master,
            amount_sell: self.amount_sell,
            amount_buy: self.amount_buy,

            timeout: self.timeout,
            },
            open: self.open,
        };
    }
}
