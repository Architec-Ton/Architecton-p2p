import "./order_sell_nft";
import "./router_base";

contract RouterSellNft with RouterBase {
    owner: Address;
    fee: Int;

    init(owner: Address, fee: Int, time: Int) {
        self.owner = owner;
        self.fee = fee;
    }

    // @notice Receive Nft Transfer Notification message, validate and send deploy and nft
    receive(notify: NftTransferNotification) {
        let forward_payload = notify.forward_payload;
        let seller = forward_payload.loadAddress();
        let requestCell = forward_payload.loadRef();
        let initCell = forward_payload.loadRef().beginParse();
        let init_seller = initCell.loadAddress();
        let init_nonce = initCell.loadInt(257);

        let expectedValue = deploy_fee + nft_transfer_fee + ton("0.005") + self.fee + ton("0.01");
        if(!SmartThrowNft(not_enough_ton, context().value > expectedValue, seller)){return;}

        let orderInit = initOf OrderSellNft(init_seller, init_nonce);
        let orderAddress = contractAddressExt(0, orderInit.code, orderInit.data);

        send(SendParameters{
            to: orderAddress,
            value: context().value - (nft_transfer_fee + ton("0.005") + self.fee + ton("0.01")),
            mode: SendIgnoreErrors | SendPayGasSeparately,
            body: requestCell,
            code: orderInit.code,
            data: orderInit.data
        });

        send_nft(nft_transfer_fee + ton("0.005"), context().sender, orderAddress, orderAddress, ton("0.005"));
    }

    override get fun calculate_order(seller: Address, nonce: Int): Address {
        let orderInit = initOf OrderSellNft(seller, nonce);
        return contractAddressExt(0, orderInit.code, orderInit.data);
    }
}
