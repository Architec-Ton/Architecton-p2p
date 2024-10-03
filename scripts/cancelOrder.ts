import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Order } from '../wrappers/Order';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('EQCTeDYiKcGu2f3XgEYCme_Xhc1GDU84Oy2cl5MTWqA_UGLs')
    const order = provider.open(Order.fromAddress(orderAddress));

    await order.send(
        provider.sender(),
        {
            value: toNano(0.06)
        },
        {
            $$type: 'Cancel'
        }
    )
}
