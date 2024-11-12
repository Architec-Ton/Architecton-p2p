import { Address, beginCell, toNano } from '@ton/core';
import { OrderSellNftToTon, Request, storeRequest } from '../wrappers/OrderSellNftToTon';
import { NetworkProvider, sleep } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const nftAddress = Address.parse('kQBA8OdKeAz_4KuiTwlV29_qcfC1LEPJFZWnQKRGwR0ser2q')

    const order = provider.open(await OrderSellNftToTon.fromInit(provider.sender().address!, BigInt(Date.now())));

    const expiration_time = 60 * 60 * 24 * 100;

    const request: Request = {
        $$type: 'Request',
        nft_address: nftAddress,
        amount_buy: toNano(0.5),
        expiration_time: BigInt(Math.floor(Date.now() / 1000) + expiration_time)
    };

    await provider.sender().send({
            value: toNano(0.03),
            to: order.address,
            bounce: false,
            init: order.init,
            body: beginCell().store(storeRequest(request)).endCell()
        }
    );

    console.log(order.address)
    while (!await provider.isContractDeployed(order.address)) {
        console.log('wait for deploy')
        await sleep(2000)
    }

    // const state = await order.getState()
    // console.log(state)
}
