const deploy_fee: Int = ton("0.01");

message NewOwner {
    new_owner: Address;
}

message NewFee {
    new_fee: Int;
}

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

    get fun owner(): Address {
        return self.owner
    }

    get fun fee(): Int {
        return self.fee
    }

    abstract get fun calculate_order(initData: InitData): Address;
}
