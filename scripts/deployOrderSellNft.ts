import { Address, beginCell, toNano } from '@ton/core';
import { OrderSellNft, Request, storeRequest } from '../wrappers/OrderSellNft';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const buyJettonMaster = Address.parse(masters.get('ARC')!!);
    const nftAddress = Address.parse('')

    const order = provider.open(await OrderSellNft.fromInit(provider.sender().address!, BigInt(Date.now())));

    const buyJettonWallet = await getJettonWallet(buyJettonMaster, order.address);

    const expiration_time = 60 * 60 * 24 * 100;

    const buyDecimals = await getJettonDecimals(buyJettonMaster)

    const request: Request = {
        $$type: 'Request',
        nft_address: nftAddress,
        order_jetton_buy_wallet: buyJettonWallet,
        jetton_buy_master: buyJettonMaster,
        amount_buy: BigInt(600 * 10 ** buyDecimals),
        expiration_time: BigInt(Math.floor(Date.now() / 1000) + expiration_time)
    };

    await provider.sender().send({
            value: toNano(0.02),
            to: order.address,
            bounce: false,
            init: order.init,
            body: beginCell().store(storeRequest(request)).endCell()
        }
    );

    console.log(order.address)
    while (!await provider.isContractDeployed(order.address)) {
        console.log('wait for deploy')
        await sleep(2000)
    }

    // const state = await order.getState()
    // console.log(state)
}
