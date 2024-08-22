import "./order";

const deploy_fee: Int = ton("0.01");
const not_enough_ton: Int = 37;
const invalid_seller: Int = 45;

message NewOwner {
    new_owner: Address;
}

message NewFee {
    new_fee: Int;
}

contract Router {
    owner: Address;
    fee: Int;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    receive() {}

    receive(msg: NewOwner) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.owner = msg.new_owner;
    }

    receive(msg: NewFee) {
        nativeThrowUnless(access_denided, self.owner == context().sender);
        self.fee = msg.new_fee;
    }

    receive(notify: JettonTransferNotification) {
        let seller = notify.sender;
        let payload = notify.forward_payload;
        let requestCell = payload.loadRef();
        let initDataCell = payload.loadRef().beginParse();

        initDataCell.skipBits(32);

        let initData: InitData = InitData {
            seller: initDataCell.loadAddress(),
            time: initDataCell.loadUint(64),
        };

        nativeThrowUnless(invalid_seller, seller == initData.seller);

        if (context().value < deploy_fee + jetton_transfer_fee + self.fee) {
            send(SendParameters{
                to: context().sender,
                value: 0,
                bounce: true,
                mode: SendIgnoreErrors | SendRemainingValue,
                body: JettonTransfer {
                    query_id: 0,
                    amount: notify.amount,
                    destination: seller,
                    response_destination: seller,
                    custom_payload: null,
                    forward_payload: null,
                    forward_ton_amount: 0
                }.toCell()
            });

            nativeThrow(not_enough_ton);
        }

        let orderInit = initOf Order(initData);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

        send(SendParameters{
            to: self.owner,
            value: self.fee,
            bounce: false,
            mode: SendIgnoreErrors | SendPayGasSeparately,
            body: null,
        });

        send(SendParameters{
            to: orderAddress,
            value: deploy_fee,
            bounce: true,
            mode: SendIgnoreErrors | SendPayGasSeparately,
            body: requestCell,
            code: orderInit.code,
            data: orderInit.data
        });

        send(SendParameters{
            to: context().sender,
            value: 0,
            bounce: true,
            mode: SendIgnoreErrors | SendRemainingBalance,
            body: JettonTransfer {
                query_id: 0,
                amount: notify.amount,
                destination: orderAddress,
                response_destination: orderAddress,
                custom_payload: null,
                forward_payload: null,
                forward_ton_amount: ton("0.01")
            }.toCell()
        });
    }

    get fun owner(): Address {
        return self.owner
    }

    get fun fee(): Int {
        return self.fee
    }
}
