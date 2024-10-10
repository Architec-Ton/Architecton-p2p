import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { storeNewFee, storeNewOwner } from '../build/Router/tact_Router';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQBGL5ZSBUsVAeWlkXw_LoAcXeF3m9Lu9q3wm-dKifixG3XH')
    if (!await provider.isContractDeployed(routerAddress)) {
        console.log(`Router with address ${routerAddress.toString()} doesn't deployed`)
        return
    }

    await provider.sender().send({
        value: toNano(0.145),
        to: routerAddress,
        body: beginCell().store(storeNewOwner({
            $$type: 'NewOwner',
            new_owner: Address.parse('0QC0h5VzJyKdNQ2m_SxrNmVIpkWVLcRI1MRVCIULBOGcmKYR')
        })).endCell()
    });
}
