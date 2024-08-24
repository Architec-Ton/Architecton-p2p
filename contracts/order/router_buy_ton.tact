import "./order_buy_ton";
import "./router_base";

contract RouterBuyTon with RouterBase {
    owner: Address;
    fee: Int;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    receive(notify: JettonTransferNotification) {
        let seller = notify.sender;
        let forward_payload = notify.forward_payload;
        let requestCell = forward_payload.loadRef();
        let initDataCell = forward_payload.loadRef().beginParse();

        if (context().value < deploy_fee + jetton_transfer_fee + self.fee) {
            basicJettonTransfer(context().sender, seller, notify.amount, 0, SendIgnoreErrors | SendRemainingBalance);

            nativeThrow(not_enough_ton);
        }

        initDataCell.skipBits(32);
        let initData = InitData {
            seller: initDataCell.loadAddress(),
            nonce: initDataCell.loadUint(64)
        };

        let orderInit = initOf OrderBuyTon(initData);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

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

    override get fun calculate_order(initData: InitData): Address {
        let orderInit = initOf OrderBuyTon(initData);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
