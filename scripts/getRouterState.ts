import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Router } from '../wrappers/Router';

export async function run(provider: NetworkProvider) {
    const router = provider.open(Router.fromAddress(Address.parse('EQC1DQxqTWnb5ZCrxsGWQHyxY1VKwkwYVrMH9I4PL7bAmxjo')));

    console.log(await router.getOwner())
    console.log(await router.getFee())
}
