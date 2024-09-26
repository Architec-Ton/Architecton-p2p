import { Address, beginCell, toNano } from '@ton/core';
import { Order, Request, storeRequest } from '../wrappers/Order';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet, storeJettonTransfer } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQB5F6z09uZiBWYzKuYRIgL7L227y7czWUeTxwLW8bIaY5kg')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const sellJettonMaster = Address.parse(masters.get('BNK')!!);
    const buyJettonMaster = Address.parse(masters.get('ARC')!!);

    const nonce = BigInt(Date.now())
    const order = await Order.fromInit(provider.sender().address!, nonce);

    const sellJettonWallet = await getJettonWallet(sellJettonMaster, order.address);
    const buyJettonWallet = await getJettonWallet(buyJettonMaster, order.address);
    const jettonWallet = await getJettonWallet(sellJettonMaster, provider.sender().address!);

    const expiration_time = 60 * 60 * 24 * 100;

    const sellDecimals = await getJettonDecimals(sellJettonMaster)
    const buyDecimals = await getJettonDecimals(buyJettonMaster)

    const request: Request = {
        $$type: 'Request',
        order_jetton_sell_wallet: sellJettonWallet,
        order_jetton_buy_wallet: buyJettonWallet,
        jetton_sell_master: sellJettonMaster,
        jetton_buy_master: buyJettonMaster,
        amount_sell: BigInt(2 * 10 ** sellDecimals),
        amount_buy: BigInt(10 * 10 ** buyDecimals),
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

    const value = toNano(0.115) + toNano(1) //toNano(0.01) + toNano(0.04) + toNano(0.01) + toNano(0.01) + toNano(0.007)
    const gas = toNano(0.039325279)
    const sellTransferBody = beginCell()
        .store(storeJettonTransfer({
            $$type: 'JettonTransfer',
            query_id: 0n,
            amount: request.amount_sell,
            destination: routerAddress,
            response_destination: routerAddress,
            custom_payload: beginCell().endCell(),
            forward_ton_amount: value - gas,
            forward_payload: createOrderBody
        }))
        .endCell();

    await provider.sender().send({
        value: value,
        to: jettonWallet,
        body: sellTransferBody
    });
}
