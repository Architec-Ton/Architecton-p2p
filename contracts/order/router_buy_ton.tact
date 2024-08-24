import "./order_buy_ton";
import "./router_base";

contract RouterBuyTon with RouterBase {
    owner: Address;
    fee: Int;
    nonce: Int = 0;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    receive(notify: JettonTransferNotification) {
        let seller = notify.sender;
        let requestCell = notify.forward_payload.loadRef();

        if (context().value < deploy_fee + jetton_transfer_fee + self.fee) {
            basicJettonTransfer(context().sender, seller, notify.amount, 0, SendIgnoreErrors | SendRemainingBalance);

            nativeThrow(not_enough_ton);
        }

        let orderInit = initOf OrderBuyTon(myAddress(), self.nonce);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);
        self.nonce += 1;

        send(SendParameters{
            to: self.owner,
            value: self.fee,
            mode: SendIgnoreErrors | SendPayGasSeparately,
        });

        send(SendParameters{
            to: orderAddress,
            value: deploy_fee,
            mode: SendIgnoreErrors | SendPayGasSeparately,
            body: requestCell,
            code: orderInit.code,
            data: orderInit.data
        });

        basicJettonTransfer(context().sender, orderAddress, notify.amount, ton("0.01"), SendIgnoreErrors | SendRemainingBalance);
    }

    override get fun calculate_order(seller: Address, nonce: Int): Address {
        nativeThrowUnless(invalid_nonce, nonce <= self.nonce);

        let orderInit = initOf OrderBuyTon(myAddress(), nonce);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
