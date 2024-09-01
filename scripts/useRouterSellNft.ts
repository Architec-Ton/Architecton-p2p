import { Address, beginCell, toNano } from '@ton/core';
import { OrderSellNft, Request, storeRequest } from '../wrappers/OrderSellNft';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet, storeJettonTransfer } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQB9D81YLkCu7Enyb6yGAo-zLEgogtmioFvkTqu75G9xhU7_')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const buyJettonMaster = Address.parse(masters.get('ARC')!!);
    const nftAddress = Address.parse('')

    const nonce = BigInt(Date.now())
    const order = await OrderSellNft.fromInit(provider.sender().address!, nonce);

    const buyJettonWallet = await getJettonWallet(buyJettonMaster, order.address);

    const timeout = 60 * 60 * 24 * 100;

    const buyDecimals = await getJettonDecimals(buyJettonMaster)

    const request: Request = {
        $$type: 'Request',
        nft_address: nftAddress,
        order_jetton_buy_wallet: buyJettonWallet,
        jetton_buy_master: buyJettonMaster,
        amount_buy: BigInt(10 * 10 ** buyDecimals),
        timeout: BigInt(Math.floor(Date.now() / 1000) + timeout)
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
        .storeCoins(toNano(0.2))
        .storeBit(1)
        .storeSlice(createOrderBody)
        .endCell();

    await provider.sender().send({
        value: toNano(0.3),
        to: nftAddress,
        sendMode: 2,
        body: sellTransferBody
    });
}
