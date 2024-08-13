import { Address, beginCell, toNano } from '@ton/core';
import { Order } from '../wrappers/Order';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet, storeJettonTransfer } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('kQCUdgpg81PkXM7VfiZyKAMipryq16zsGQt7Ej2jw9N97KaY')
    if (!await provider.isContractDeployed(orderAddress)) {
        console.log(`Order with address ${orderAddress.toString()} doesn't deployed`)
        return
    }

    const order = provider.open(Order.fromAddress(orderAddress))
    const jettonMaster = Address.parse(masters.get('BNK')!!);

    const decimals = await getJettonDecimals(jettonMaster)
    const jettonWallet = await getJettonWallet(jettonMaster, provider.sender().address!);

    const transferBody = beginCell()
        .store(storeJettonTransfer({
            $$type: 'JettonTransfer',
            query_id: 0n,
            amount: 5n * BigInt(10 ** decimals),
            destination: order.address,
            response_destination: order.address,
            custom_payload: beginCell().endCell(),
            forward_ton_amount: toNano(0.1),
            forward_payload: beginCell().endCell().asSlice(),
        }))
        .endCell()

    await provider.sender().send({
            value: toNano(0.2),
            to: jettonWallet,
            body: transferBody,
        }
    );

    // const state = await order.getState()
    // console.log(state)
}
