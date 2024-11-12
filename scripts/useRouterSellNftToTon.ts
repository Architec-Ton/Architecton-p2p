import { Address, beginCell, toNano } from '@ton/core';
import { Request, storeRequest } from '../wrappers/OrderSellNftToTon';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQCleSIP_IKnAxLYBYX96FpIyXqlBPFBpVYEfSLTDfyhwqu-')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const nftAddress = Address.parse('kQBVdQKsEN3Ipimrbh69gCxG9VnqDP7cvMyFSIeFa_8_g2Xx')

    const nonce = BigInt(Date.now())

    const expiration_time = 60 * 60 * 24 * 100;

    const request: Request = {
        $$type: 'Request',
        nft_address: nftAddress,
        amount_buy: toNano(0.5),
        expiration_time: BigInt(Math.floor(Date.now() / 1000) + expiration_time)
    };

    const createOrderBody = beginCell()
        .storeRef(beginCell()
            .store(storeRequest(request))
            .endCell())
        .storeRef(beginCell()
            .storeAddress(provider.sender().address!)
            .storeInt(nonce, 257)
            .endCell())
        .endCell()
        .asSlice();

    const sellTransferBody = beginCell()
        .storeUint(0x5fcc3d14, 32)
        .storeUint(0, 64)
        .storeAddress(routerAddress)
        .storeAddress(routerAddress)
        .storeBit(0)
        .storeCoins(toNano(0.24))
        .storeBit(1)
        .storeSlice(createOrderBody)
        .endCell();

    await provider.sender().send({
        value: toNano(0.3),
        to: nftAddress,
        body: sellTransferBody
    });
}
