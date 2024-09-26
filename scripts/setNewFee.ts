import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { storeNewFee } from '../build/Router/tact_Router';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQB5F6z09uZiBWYzKuYRIgL7L227y7czWUeTxwLW8bIaY5kg')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    await provider.sender().send({
        value: toNano(0.145),
        to: routerAddress,
        body: beginCell().store(storeNewFee({
            $$type: 'NewFee',
            new_fee: toNano(1)
        })).endCell()
    });
}
