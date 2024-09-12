const deploy_fee: Int = ton("0.005");

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

    receive() {}

    receive(msg: NewOwner) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.owner = msg.new_owner;
    }

    receive(msg: NewFee) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.fee = msg.new_fee;
    }

    receive(msg: Withdraw) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingBalance,
        });
    }

    get fun owner(): Address {
        return self.owner
    }

    get fun fee(): Int {
        return self.fee
    }

    abstract get fun calculate_order(seller: Address, nonce: Int): Address;
}
