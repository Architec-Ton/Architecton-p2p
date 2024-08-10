import "@stdlib/deploy";

import "./workchain.fc";
import "./jetton-utils.fc";

//const STATUS_SIZE: Int = 4;
//
//@name(cell_hash)
//native cellHash(c: Cell): Int;
//
//
//inline fun pack_jetton_wallet_data(status: Int, balance: Int, seller_address: Slice, jetton_master_address: Slice): Cell {
//    return beginCell()
//    .storeUint(status, STATUS_SIZE)
//    .storeCoins(balance)
//    .storeSlice(seller_address)
//    .storeSlice(jetton_master_address)
//    .endCell();
//}
//
//inline fun calculate_jetton_wallet_state_init(seller_address: Slice, jetton_master_address: Slice, jetton_wallet_code: Cell): Cell {
//    return beginCell()
//    .storeUint(0, 2)
//    .storeRef(jetton_wallet_code)
//    .storeRef(
//    pack_jetton_wallet_data(0, 0, seller_address, jetton_master_address))
//    .storeUint(0, 1)
//    .endCell();
//}
//
//
//inline fun calculate_jetton_wallet_address(state_init: Cell): Slice {
//    return beginCell()
//    .storeUint(4, 3)
//    .storeInt(0, 8)
//    .storeUint(cellHash(state_init), 256)
//    .endCell()
//    .beginParse();
//}
//
//inline fun calculate_user_jetton_wallet_address(seller_address: Slice, jetton_master_address: Slice, jetton_wallet_code: Cell): Slice {
//    return calculate_jetton_wallet_address(calculate_jetton_wallet_state_init(seller_address, jetton_master_address, jetton_wallet_code));
//}

message Request {
    jetton_sell_code: Cell;
    jetton_buy_code: Cell;
    amount_sell: Int as coins;
    amount_buy: Int as coins;
    jetton_sell_master: Address;
    jetton_buy_master: Address;
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

@name(calculate_user_jetton_wallet_address)
native calculateUserJettonWalletAddress(seller: Slice, jetton_master: Slice, jetton_wallet_code: Cell): Slice;

inline fun calculateJettonWalletAddress(seller: Address, jetton_master: Address, jetton_wallet_code: Cell): Address {
    return calculateUserJettonWalletAddress(seller.asSlice(), jetton_master.asSlice(), jetton_wallet_code).loadAddress();
}

const jetton_transfer_fee: Int = ton("0.07"); // ~ 0.4 TON, medium fee for any amount of Jetton is 0.037 TON - docs
const invalid_address: Int = 136;
const access_denided: Int = 132;
const order_closed: Int = 133;
const invalid_jetton_amount: Int = 39;
const order_not_opened: Int = 40;
const order_already_opened: Int = 41;

contract Order with Deployable {
    seller: Address;

    my_jetton_buy_wallet: Address;
    my_jetton_sell_wallet: Address;

    amount_sell: Int;
    amount_buy: Int;

    open: Bool;
    close: Bool;

    get fun calculateJettonWalletAddress(seller: Address, jetton_master: Address, jetton_wallet_code: Cell): Address {
        return calculateJettonWalletAddress(seller, jetton_master, jetton_wallet_code);
    }

    init(seller: Address, request: Request, time: Int) {
        let jetton_buy_seller_wallet: Address = calculateJettonWalletAddress(seller, request.jetton_buy_master, request.jetton_buy_code);
        let jetton_sell_seller_wallet: Address = calculateJettonWalletAddress(seller, request.jetton_sell_master, request.jetton_sell_code);

//        dump(jetton_sell_seller_wallet);
//        dump(jetton_buy_seller_wallet);

        self.seller = seller;
        self.my_jetton_buy_wallet = calculateJettonWalletAddress(myAddress(), request.jetton_buy_master, request.jetton_buy_code);
        self.my_jetton_sell_wallet = calculateJettonWalletAddress(myAddress(), request.jetton_sell_master, request.jetton_sell_code);

        self.amount_sell = request.amount_sell;
        self.amount_buy = request.amount_buy;

        self.open = false;
        self.close = false;
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
