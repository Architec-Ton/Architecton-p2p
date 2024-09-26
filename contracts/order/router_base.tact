const deploy_fee: Int = ton("0.006");

message NewOwner {
    new_owner: Address;
}

message NewFee {
    new_fee: Int;
}

message Withdraw {}

trait RouterBase {
    owner: Address;
    fee: Int;

    // receive empty message
    receive() {}

    // @notice Receive NewOwner message, validate and set new owner for router
    // @param msg - message with address of new owner
    receive(msg: NewOwner) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.owner = msg.new_owner;
    }

    // @notice Receive NewFee message, validate and set new fee for router
    // @param msg - message with new fee for orders
    receive(msg: NewFee) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.fee = msg.new_fee;
    }

    // @notice Receive Withdraw message, validate and withdraw all saved balance
    receive(msg: Withdraw) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        send(SendParameters{
            to: self.owner,
            value: myBalance() - ton("0.01"),
            mode: SendIgnoreErrors,
        });
    }

    get fun owner(): Address {
        return self.owner
    }

    get fun fee(): Int {
        return self.fee
    }

    // @notice Getter for calculating corresponding order address
    // @param seller - address of order seller
    // @param nonce - nonce for order qniqueness
    abstract get fun calculate_order(seller: Address, nonce: Int): Address;
}
