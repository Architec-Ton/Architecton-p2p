import { Address, beginCell, toNano } from '@ton/core';
import { OrderSellTon, Request, storeRequest } from '../wrappers/OrderSellTon';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const feeWallet = Address.parse(process.env.FEE_WALLET!)
    const buyJettonMaster = Address.parse(masters.get('ARC')!!);

    const order = provider.open(await OrderSellTon.fromInit(provider.sender().address!, feeWallet, BigInt(Date.now())));

    const buyJettonWallet = await getJettonWallet(buyJettonMaster, order.address);

    const timeout = 60 * 60 * 24 * 100;

    const buyDecimals = await getJettonDecimals(buyJettonMaster)

    const request: Request = {
        $$type: 'Request',
        order_jetton_buy_wallet: buyJettonWallet,
        jetton_buy_master: buyJettonMaster,
        amount_sell: toNano(10n),
        amount_buy: BigInt(5 * 10 ** buyDecimals),
        timeout: BigInt(Math.floor(Date.now() / 1000) + timeout)
    };

    await provider.sender().send({
            value: toNano(0.02),
            to: order.address,
            bounce: false,
            init: order.init,
            body: beginCell().store(storeRequest(request)).endCell()
        }
    );

    await provider.waitForDeploy(order.address);

    // const state = await order.getState()
    // console.log(state)
}
