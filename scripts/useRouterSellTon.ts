import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet } from './jetton-helpers';
import { OrderSellTon, Request } from '../build/OrderSellTon/tact_OrderSellTon';
import { storeTonTransferNotification } from '../build/RouterSellTon/tact_RouterSellTon';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQC4YcIjbV9rx_5_Ko2WgNTqMXWp0q7ih-9X_GPriI2ha7UJ')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const buyJettonMaster = Address.parse(masters.get('ARC')!!);

    const nonce = BigInt(Date.now())
    const orderSellTon = await OrderSellTon.fromInit(provider.sender().address!, nonce)
    const buyJettonWallet = await getJettonWallet(buyJettonMaster, orderSellTon.address);

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
        value: toNano(0.1) + request.amount_sell,
        to: routerAddress,
        body: beginCell()
            .store(storeTonTransferNotification({
                $$type: 'TonTransferNotification',
                seller: provider.sender().address!,
                nonce: nonce,
                request: request
            }))
            .endCell()
    });
}
