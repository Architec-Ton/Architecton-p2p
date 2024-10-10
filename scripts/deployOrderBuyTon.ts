import { Address, beginCell, toNano } from '@ton/core';
import { OrderBuyTon, Request, storeRequest } from '../wrappers/OrderBuyTon';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const sellJettonMaster = Address.parse(masters.get('BNK')!!);

    const order = provider.open(await OrderBuyTon.fromInit(provider.sender().address!, BigInt(Date.now())));

    const sellJettonWallet = await getJettonWallet(sellJettonMaster, order.address);

    const expiration_time = 60 * 60 * 24 * 100;

    const sellDecimals = await getJettonDecimals(sellJettonMaster)

    const request: Request = {
        $$type: 'Request',
        order_jetton_sell_wallet: sellJettonWallet,
        jetton_sell_master: sellJettonMaster,
        amount_sell: BigInt(5 * 10 ** sellDecimals),
        amount_buy: toNano(3),
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
