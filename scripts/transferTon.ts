import { Address, beginCell, toNano } from '@ton/core';
import { OrderBuyTon } from '../wrappers/OrderBuyTon';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('kQANivXdhYsPlnsXTqzuDypcIwEl6wo00Go21lfx_wZ-o84F')
    if (!await provider.isContractDeployed(orderAddress)) {
        console.log(`Order with address ${orderAddress.toString()} doesn't deployed`)
        return
    }

    const order = provider.open(OrderBuyTon.fromAddress(orderAddress))
    const maybeLess = toNano(0.019734226)

    await provider.sender().send({
            value: toNano(1 + 0.06), // - maybeLess - можно уменьшить на это значение
            to: order.address,
            body: beginCell().storeUint(0, 32).storeStringTail("transfer ton").endCell()
        }
    );

    // const state = await order.getState()
    // console.log(state)
}
