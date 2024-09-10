import { TupleBuilder, Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { makeSnakeCell } from '../scripts/jetton-helpers';
import { compile } from '@ton/blueprint';

export type CollectionConfig = {
    ownerAddress: Address,
    nextItemIndex: number,
    collectionContent: string,
    commonContent: string,
    nftItemCode: Cell,
    royaltyParams: {
        royaltyFactor: number,
        royaltyBase: number,
        royaltyAddress: Address
    }
};

const OFF_CHAIN_CONTENT_PREFIX = 0x01
export function encodeOffChainContent(content: string) {
    let data = Buffer.from(content)
    let offChainPrefix = Buffer.from([OFF_CHAIN_CONTENT_PREFIX])
    data = Buffer.concat([offChainPrefix, data])
    return makeSnakeCell(data)
}

export async function collectionConfigToCell(config: CollectionConfig): Promise<Cell> {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextItemIndex, 64)
        .storeRef(beginCell().storeRef(encodeOffChainContent(config.collectionContent)).endCell())
        .storeRef(await compile('nft-item'))
        .storeRef(beginCell()
            .storeUint(config.royaltyParams.royaltyFactor, 16)
            .storeUint(config.royaltyParams.royaltyBase, 16)
            .storeAddress(config.royaltyParams.royaltyAddress)
            .endCell())
        .endCell();
}

export class Collection implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Collection(address);
    }

    static async createFromConfig(config: CollectionConfig, code: Cell, workchain = 0) {
        const data = await collectionConfigToCell(config);
        const init = { code, data };
        return new Collection(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getCollectionData(provider: ContractProvider): Promise<[bigint, Cell, Address]> {
        const { stack } = await provider.get('get_collection_data', [])
        return [
            stack.readBigNumber(),
            stack.readCell(),
            stack.readAddress()
        ]
    }

    async getNftAddressByIndex(provider: ContractProvider, index: bigint): Promise<Address> {
        const tb = new TupleBuilder()
        tb.writeNumber(index)
        const { stack } = await provider.get('get_nft_address_by_index', tb.build())
        return stack.readAddress()
    }
}