import { toNano } from '@ton/core';
import { Order } from '../wrappers/Order';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const order = provider.open(await Order.fromInit());

    await order.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(order.address);

    // run methods on `order`
}
