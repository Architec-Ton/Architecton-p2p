const nft_transfer_fee: Int = ton("0.01");

message(0x05138d91) NftTransferNotification {
    query_id: Int as uint64;                // arbitrary request number
    forward_payload: Slice as remaining;    // optional custom payload
}

inline fun send_nft(value: Int, nft_address: Address, new_owner: Address, responce: Address, forward_amount: Int) {
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
        mode: SendIgnoreErrors,
        body: body
    });
}

inline fun SmartThrowNft(code: Int, condition: Bool, new_owner: Address): Bool {
    if (!condition) {
        if (context().value - context().readForwardFee() >= nft_transfer_fee) {
            send_nft(nft_transfer_fee, context().sender, new_owner, new_owner, 0);
        } else {
            nativeThrow(not_enough_ton);
        }
        emit(beginCell().storeUint(code, 32).endCell());
    }

    return condition;
}