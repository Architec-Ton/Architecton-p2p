import { Address, beginCell, toNano } from '@ton/core';
import { OrderBuyTon } from '../wrappers/OrderBuyTon';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('EQBpZvplYUYJmdJYZxS6QaPJZZqX3fupep3sVUJudd2o2OwR')
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
