import { Address, beginCell, toNano } from '@ton/core';
import { Order, Request, storeRequest } from '../wrappers/Order';
import { NetworkProvider } from '@ton/blueprint';
import { calculateUSDTWallet } from '../wrappers/jettonAddressesCalculation';

export async function run(provider: NetworkProvider) {
    const sellJettonMaster = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs');
    const buyJettonMaster = Address.parse('EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT');

    const order = provider.open(await Order.fromInit(provider.sender().address!!, BigInt(Math.floor(Date.now()))));

    const sellJettonWallet = await calculateUSDTWallet(sellJettonMaster, order.address);
    const buyJettonWallet = await calculateUSDTWallet(buyJettonMaster, order.address);

    const timeout = 60 * 60 * 24 * 100;

    const request: Request = {
        $$type: 'Request',
        my_jetton_sell_wallet: sellJettonWallet,
        my_jetton_buy_wallet: buyJettonWallet,
        jetton_sell_master: sellJettonMaster,
        jetton_buy_master: buyJettonMaster,
        amount_sell: 10n,
        amount_buy: 5n,
        timeout: BigInt(Math.floor(Date.now() / 1000) + timeout)
    };

    await provider.sender().send({
            value: toNano(0.02),
            to: order.address,
            sendMode: 2,
            bounce: false,
            init: order.init,
            body: beginCell().store(storeRequest(request)).endCell()
        }
    );

    await provider.waitForDeploy(order.address);

    const state = await order.getState()
    console.log(state)
}
