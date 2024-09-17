import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet, storeJettonTransfer } from './jetton-helpers';
import { OrderBuyTon, Request, storeRequest  } from '../build/OrderBuyTon/tact_OrderBuyTon';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQBzxKNB6ISFk1KAvlCVQ0TKwunkFEtbHgAOcythztboTrSz')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    const sellJettonMaster = Address.parse(masters.get('BNK')!!);

    const nonce = BigInt(Date.now())
    const order = await OrderBuyTon.fromInit(provider.sender().address!, nonce);

    const sellJettonWallet = await getJettonWallet(sellJettonMaster, order.address);
    const jettonWallet = await getJettonWallet(sellJettonMaster, provider.sender().address!);

    const timeout = 60 * 60 * 24 * 100;

    const sellDecimals = await getJettonDecimals(sellJettonMaster)

    const request: Request = {
        $$type: 'Request',
        order_jetton_sell_wallet: sellJettonWallet,
        jetton_sell_master: sellJettonMaster,
        amount_sell: BigInt(2 * 10 ** sellDecimals),
        amount_buy: toNano(1),
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
        .store(storeJettonTransfer({
            $$type: 'JettonTransfer',
            query_id: 0n,
            amount: request.amount_sell,
            destination: routerAddress,
            response_destination: routerAddress,
            custom_payload: beginCell().endCell(),
            forward_ton_amount: toNano(0.08),
            forward_payload: createOrderBody
        }))
        .endCell();

    await provider.sender().send({
        value: toNano(0.15),
        to: jettonWallet,
        body: sellTransferBody
    });
}
