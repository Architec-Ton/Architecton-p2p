import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode } from '@ton/core';


export class Item implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Item(address);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getNftData(provider: ContractProvider): Promise<[bigint, bigint, Address, Address, Cell]> {
        const { stack } = await provider.get('get_nft_data', [])
        return [
            stack.readBigNumber(),
            stack.readBigNumber(),
            stack.readAddress(),
            stack.readAddress(),
            stack.readCell(),
        ]
    }
}