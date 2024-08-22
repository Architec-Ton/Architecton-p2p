import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { masters } from './imports/consts';
import { getJettonDecimals, getJettonWallet, storeJettonTransfer } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('kQDR6PQPL6Fml-PuJypKrP-adIqmfTrdjruP0ZZEYd_1adFa')
    if (!await provider.isContractDeployed(orderAddress)) {
        console.log(`Order with address ${orderAddress.toString()} doesn't deployed`)
        return
    }

    const jettonMaster = Address.parse(masters.get('ARC')!!);

    const decimals = await getJettonDecimals(jettonMaster)
    const jettonWallet = await getJettonWallet(jettonMaster, provider.sender().address!);

    const transferBody = beginCell()
        .store(storeJettonTransfer({
            $$type: 'JettonTransfer',
            query_id: 0n,
            amount: BigInt(10 * 10 ** decimals),
            destination: orderAddress,
            response_destination: orderAddress,
            custom_payload: beginCell().endCell(),
            forward_ton_amount: toNano(0.08),
            forward_payload: beginCell().endCell().asSlice(),
        }))
        .endCell()

    await provider.sender().send({
            value: toNano(0.15),
            to: jettonWallet,
            body: transferBody,
        }
    );
}
