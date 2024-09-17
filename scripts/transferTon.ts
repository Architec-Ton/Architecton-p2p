import { Address, beginCell, toNano } from '@ton/core';
import { OrderBuyTon } from '../wrappers/OrderBuyTon';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('kQDAgPg3kkxSh8iymFfm1QwYK8MUX1JQBz0aCdKsUH_IqPxM')
    if (!await provider.isContractDeployed(orderAddress)) {
        console.log(`Order with address ${orderAddress.toString()} doesn't deployed`)
        return
    }

    const order = provider.open(OrderBuyTon.fromAddress(orderAddress))

    await provider.sender().send({
            value: toNano(0.1 + 3),
            to: order.address,
            body: beginCell().storeUint(0, 32).storeStringTail("transfer ton").endCell()
        }
    );

    // const state = await order.getState()
    // console.log(state)
}
