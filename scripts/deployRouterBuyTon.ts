import { Address, toNano } from '@ton/core';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { RouterBuyTon } from '../wrappers/RouterBuyTon';

export async function run(provider: NetworkProvider) {
    const feeWallet = Address.parse(process.env.FEE_WALLET!)
    const feeAmount = toNano(0.01)

    const router = provider.open(await RouterBuyTon.fromInit(feeWallet, feeAmount, BigInt(Date.now())));

    await provider.sender().send({
            value: toNano(0.02),
            to: router.address,
            bounce: false,
            init: router.init,
        }
    );

    while (!await provider.isContractDeployed(router.address)) {
        console.log('wait for deploy')
        await sleep(2000)
    }

    console.log(await router.getOwner())
    console.log(await router.getFee())
}
