import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Router } from '../wrappers/Router';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQCsF9Vo1va8Jds158TM_80eAUmLDX8ZsELGkZkO8YcfeZC2')
    const router = provider.open(Router.fromAddress(routerAddress));

    await router.send(
        provider.sender(),
        {
            value: toNano(0.01)
        },
        {
            $$type: 'Withdraw'
        }
    )
}
