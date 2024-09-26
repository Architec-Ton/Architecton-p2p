const nft_transfer_fee: Int = ton("0.005");

message Request {
    nft_address: Address;
    order_jetton_buy_wallet: Address;
    jetton_buy_master: Address;
    amount_buy: Int as coins;

    expiration_time: Int as uint64 = 0;
}

message(0x05138d91) NftTransferNotification {
    query_id: Int as uint64;                // arbitrary request number
    forward_payload: Slice as remaining;    // optional custom payload
}

inline fun send_nft(value: Int, nft_address: Address, new_owner: Address, responce: Address, forward_amount: Int, mode: Int) {
    let body = beginCell()
    .storeUint(0x5fcc3d14, 32)
    .storeUint(0, 64)
    .storeAddress(new_owner) // new_owner_address
    .storeAddress(responce) // response_address
    .storeInt(0, 1) // empty custom_payload
    .storeCoins(forward_amount) // forward amount to new_owner_address
    .storeInt(0, 1) // empty forward_payload
    .endCell();

    send(SendParameters{
        to: nft_address,
        value: value,
        mode: mode,
        body: body
    })
}