import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Router } from '../wrappers/Router';

export async function run(provider: NetworkProvider) {
    const routerAddress = Address.parse('kQB5F6z09uZiBWYzKuYRIgL7L227y7czWUeTxwLW8bIaY5kg')
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
