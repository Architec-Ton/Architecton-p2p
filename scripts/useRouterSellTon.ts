import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet } from './jetton-helpers';
import { InitData, OrderSellTon, Request } from '../build/OrderSellTon/tact_OrderSellTon';
import { storeTonTransferNotification } from '../build/RouterSellTon/tact_RouterSellTon';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQDzYNlEc8rEgYqa74tNrNpm4QMPrIDSEzCQoZWyKj7sdeF7')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const buyJettonMaster = Address.parse(masters.get('ARC')!!);

    const orderInit: InitData = {
        $$type: 'InitData',
        seller: provider.sender().address!,
        nonce: BigInt(Date.now())
    };
    const orderSellTon = await OrderSellTon.fromInit(orderInit)
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
        to: orderSellTon.address,
        body: beginCell()
            .store(storeTonTransferNotification({
                $$type: 'TonTransferNotification',
                initData: orderInit,
                request: request
            }))
            .endCell()
    });
}
