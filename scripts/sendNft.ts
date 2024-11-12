import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const orderAddress = Address.parse('kQBJEDd09HFap-RYD1t6OP80jfbJKY1eOfmxqQd7ajfPWMUY')
    if (!await provider.isContractDeployed(orderAddress)) {
        console.log(`Order with address ${orderAddress.toString()} doesn't deployed`)
        return
    }
    const nftAddress = Address.parse('kQDdVkY88S5csaa1pcFcsESzfyC1N-UIrIX2a-r3EavJqsU_')

    const sellTransferBody = beginCell()
        .storeUint(0x5fcc3d14, 32)
        .storeUint(0, 64)
        .storeAddress(orderAddress)
        .storeAddress(null)
        .storeBit(0)
        .storeCoins(toNano(0.01))
        .storeBit(0)
        .endCell();

    await provider.sender().send({
        value: toNano(0.2),
        to: nftAddress,
        body: sellTransferBody
    });
}
