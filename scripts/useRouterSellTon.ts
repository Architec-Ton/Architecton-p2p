import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet } from './jetton-helpers';
import { OrderSellTon, Request } from '../build/OrderSellTon/tact_OrderSellTon';
import { storeTonTransferNotification } from '../build/RouterSellTon/tact_RouterSellTon';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQC2xubcyXl8d5xxOKXaYRJd3xvdibaUZp13o7sSpdZJcgwc')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const buyJettonMaster = Address.parse(masters.get('ARC')!!);

    const nonce = BigInt(Date.now())
    const orderSellTon = await OrderSellTon.fromInit(provider.sender().address!, nonce)
    const buyJettonWallet = await getJettonWallet(buyJettonMaster, orderSellTon.address);

    const expiration_time = 60 * 60 * 24 * 100;

    const buyDecimals = await getJettonDecimals(buyJettonMaster)

    const request: Request = {
        $$type: 'Request',
        order_jetton_buy_wallet: buyJettonWallet,
        jetton_buy_master: buyJettonMaster,
        amount_sell: toNano(1n),
        amount_buy: BigInt(5 * 10 ** buyDecimals),
        expiration_time: BigInt(Math.floor(Date.now() / 1000) + expiration_time)
    };

    await provider.sender().send({
        value: toNano(0.039) + request.amount_sell + toNano(0.01),
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
