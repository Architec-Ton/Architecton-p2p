import "./order";
import "./router_base";

contract Router with RouterBase {
    owner: Address;
    fee: Int;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    // @notice Receive Jetton Transfer Notification message, validate and send deploy and jettons
    receive(notify: JettonTransferNotification) {
        let seller = notify.sender;
        let forward_payload = notify.forward_payload;
        let requestCell = forward_payload.loadRef();
        let initCell = forward_payload.loadRef().beginParse();
        let init_seller = initCell.loadAddress();
        let init_nonce = initCell.loadInt(257);

        if (context().value < deploy_fee + jetton_transfer_fee + self.fee + ton("0.01")) {
            basicJettonTransfer(context().sender, seller, notify.amount, 0, SendIgnoreErrors | SendRemainingBalance);

            emit(beginCell().storeUint(not_enough_ton, 32).endCell());
        }

        let orderInit = initOf Order(init_seller, init_nonce);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

        send(SendParameters{
            to: orderAddress,
            value: context().value - context().readForwardFee() - self.fee - jetton_transfer_fee - ton("0.01"),
            mode: SendIgnoreErrors,
            body: requestCell,
            code: orderInit.code,
            data: orderInit.data
        });

        basicJettonTransfer(context().sender, orderAddress, notify.amount, ton("0.006"), SendIgnoreErrors);
    }

    override get fun calculate_order(seller: Address, nonce: Int): Address {
        let orderInit = initOf Order(seller, nonce);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
