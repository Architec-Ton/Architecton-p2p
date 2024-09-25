import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { storeNewFee } from '../build/Router/tact_Router';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQC0OSiLe0H_wvfaIE6rSrjbAk81Hk3wknkudojWprNFxZoc')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    await provider.sender().send({
        value: toNano(0.145),
        to: routerAddress,
        body: beginCell().store(storeNewFee({
            $$type: 'NewFee',
            new_fee: toNano(0.015)
        })).endCell()
    });
}
