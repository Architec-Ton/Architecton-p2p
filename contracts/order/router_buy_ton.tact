import "./order_buy_ton";
import "./router_base";

contract RouterBuyTon with RouterBase {
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

        let expectedValue = deploy_fee + jetton_transfer_fee + self.fee + ton("0.01");
        if(!SmartThrow(not_enough_ton, context().value > expectedValue, seller, notify.amount)){return;}


        let orderInit = initOf OrderBuyTon(init_seller, init_nonce);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

        send(SendParameters{
            to: orderAddress,
            value: context().value - expectedValue,
            mode: SendIgnoreErrors,
            body: requestCell,
            code: orderInit.code,
            data: orderInit.data
        });

        basicJettonTransfer(context().sender, orderAddress, notify.amount, ton("0.006"));
    }

    override get fun calculate_order(seller: Address, nonce: Int): Address {
        let orderInit = initOf OrderBuyTon(seller, nonce);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
