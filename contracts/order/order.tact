import "@stdlib/deploy";
import "@stdlib/ownable";

import "./workchain.fc";
import "./jetton-utils.fc";

//const STATUS_SIZE: Int = 4;
//
//@name(cell_hash)
//native cellHash(c: Cell): Int;
//
//
//inline fun pack_jetton_wallet_data(status: Int, balance: Int, owner_address: Slice, jetton_master_address: Slice): Cell {
//    return beginCell()
//    .storeUint(status, STATUS_SIZE)
//    .storeCoins(balance)
//    .storeSlice(owner_address)
//    .storeSlice(jetton_master_address)
//    .endCell();
//}
//
//inline fun calculate_jetton_wallet_state_init(owner_address: Slice, jetton_master_address: Slice, jetton_wallet_code: Cell): Cell {
//    return beginCell()
//    .storeUint(0, 2)
//    .storeRef(jetton_wallet_code)
//    .storeRef(
//    pack_jetton_wallet_data(0, 0, owner_address, jetton_master_address))
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
//inline fun calculate_user_jetton_wallet_address(owner_address: Slice, jetton_master_address: Slice, jetton_wallet_code: Cell): Slice {
//    return calculate_jetton_wallet_address(calculate_jetton_wallet_state_init(owner_address, jetton_master_address, jetton_wallet_code));
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
    destination: Address;                   // address of the new owner of the jettons
    response_destination: Address;          // address where to send a response with confirmation of a successful transfer and the rest of the incoming message Toncoins.
    custom_payload: Cell?;                  // optional custom payload
    forward_ton_amount: Int as coins;       // the amount of nanotons to be sent to the destination address.
    forward_payload: Slice?;    // optional custom data that should be sent to the destination address.
}

@name(calculate_user_jetton_wallet_address)
native calculateUserJettonWalletAddress(owner: Slice, jetton_master: Slice, jetton_wallet_code: Cell): Slice;

inline fun calculateJettonWalletAddress(owner: Address, jetton_master: Address, jetton_wallet_code: Cell): Address {
    return calculateUserJettonWalletAddress(owner.asSlice(), jetton_master.asSlice(), jetton_wallet_code).loadAddress();
}

inline fun getJettonTransferBody(msg: JettonTransfer): Cell {
    return beginCell()
    .storeUint(260734629, 32)
    .storeUint(msg.query_id, 64)
    .storeCoins(msg.amount)
    .storeAddress(msg.destination)
    .storeAddress(msg.response_destination)
    .storeCoins(msg.forward_ton_amount)
    .storeUint(0, 1)
    .endCell()
}

const jetton_transfer_fee: Int = ton("0.07"); // ~ 0.4 TON, medium fee for any amount of Jetton is 0.037 TON - docs
const not_valid_wallet: Int = 74;

contract Order with Deployable, Ownable {
    owner: Address;

    my_jetton_buy_wallet: Address;
    my_jetton_sell_wallet: Address;

    amount_sell: Int;
    amount_buy: Int;

    open: Bool;
    close: Bool;

    init(owner: Address, request: Request, time: Int) {
        let jetton_buy_owner_wallet: Address = calculateJettonWalletAddress(owner, request.jetton_buy_master, request.jetton_buy_code);
        let jetton_sell_owner_wallet: Address = calculateJettonWalletAddress(owner, request.jetton_sell_master, request.jetton_sell_code);

//        dump(jetton_sell_owner_wallet);
//        dump(jetton_buy_owner_wallet);

        self.owner = owner;
        self.my_jetton_buy_wallet = calculateJettonWalletAddress(myAddress(), request.jetton_buy_master, request.jetton_buy_code);
        self.my_jetton_sell_wallet = calculateJettonWalletAddress(myAddress(), request.jetton_sell_master, request.jetton_sell_code);

        self.amount_sell = request.amount_sell;
        self.amount_buy = request.amount_buy;

        self.open = false;
        self.close = false;
    }

    receive(notify: JettonTransferNotification) {
        require(!self.close, "order already closed");

        let ctx: Context = context();

        if (ctx.sender == self.my_jetton_sell_wallet) {
            require(notify.sender == self.owner, "invalid sender");
            require(notify.amount == self.amount_sell, "invalid jetton amount");
            self.open = true;
        } else if (ctx.sender == self.my_jetton_buy_wallet) {
            require(self.open, "order not opened");
            require(notify.amount == self.amount_buy, "invalid jetton amount");

            let buyer: Address = notify.sender;
            //        let buyer_jetton_sell_wallet = calculateUserJettonWalletAddress(buyer, self.request.jetton_buy_master, self.request.jetton_buy_code);
            //        let sellet_jetton_buy_wallet = calculateJettonWalletAddress(self.owner, self.request.jetton_sell_master, self.request.jetton_sell_code);

            send(SendParameters{
                to: self.my_jetton_buy_wallet,
                value: jetton_transfer_fee,
                bounce: true,
                mode: SendIgnoreErrors,
                body: JettonTransfer {
                    query_id: 0,
                    amount: self.amount_buy,
                    destination: self.owner,
                    response_destination: self.owner,
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
                    forward_payload: emptySlice(),
                    forward_ton_amount: 0
                }.toCell()
            });

            self.open = false;
            self.close = true;
        } else {
            throw(not_valid_wallet);
        }
    }

    receive("cancel") {
        require(self.open && !self.close, "order already closed");

        let ctx: Context = context();

        require(ctx.sender == self.owner, "invalid sender");

        send(SendParameters{
            to: self.my_jetton_sell_wallet,
            value: jetton_transfer_fee,
            bounce: true,
            mode: SendIgnoreErrors,
            body: JettonTransfer {
                query_id: 0,
                amount: self.amount_buy,
                destination: self.owner,
                response_destination: self.owner,
                custom_payload: null,
                forward_payload: null,
                forward_ton_amount: 0
            }.toCell()
        });

        self.open = false;
        self.close = true;
    }

    // todo: getters(what?), order cancellation, own calculate function, fees (maybe remValue to owner)
}
