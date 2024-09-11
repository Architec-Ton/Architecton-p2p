import {
    TupleBuilder,
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    ADNLAddress,
    Builder, TupleReader
} from '@ton/core';

export type InitData = {
    $$type: 'InitData';
    seller: Address;
    nonce: bigint;
}

export function walletConfigToCell(initData: any): Cell {
    return beginCell()
        .storeBit(0)
        .storeAddress(initData.seller)
        .storeInt(initData.nonce, 257)
        .endCell();
}

export const Opcodes = {
    increase: 0x7e8764ef,
};

function loadGetterTupleRequest(source: TupleReader) {
    let _order_jetton_sell_wallet = source.readAddress();
    let _order_jetton_buy_wallet = source.readAddress();
    let _jetton_sell_master = source.readAddress();
    let _jetton_buy_master = source.readAddress();
    let _amount_sell = source.readBigNumber();
    let _amount_buy = source.readBigNumber();
    let _timeout = source.readBigNumber();
    return { $$type: 'Request' as const, order_jetton_sell_wallet: _order_jetton_sell_wallet, order_jetton_buy_wallet: _order_jetton_buy_wallet, jetton_sell_master: _jetton_sell_master, jetton_buy_master: _jetton_buy_master, amount_sell: _amount_sell, amount_buy: _amount_buy, timeout: _timeout };
}

function loadGetterTupleState(source: TupleReader) {
    let _seller = source.readAddress();
    let _router = source.readAddress();
    const _request = loadGetterTupleRequest(source);
    let _open = source.readBoolean();
    let _filled = source.readBoolean();
    return { $$type: 'State' as const, seller: _seller, router: _router, request: _request, open: _open, filled: _filled };
}

export class Order implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Order(address);
    }

    static createFromConfig(config: any, code: Cell, workchain = 0) {
        const data = walletConfigToCell(config);
        const init = { code, data };
        return new Order(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getState(provider: ContractProvider) {
        let builder = new TupleBuilder();
        let source = (await provider.get('state', builder.build())).stack;
        const result = loadGetterTupleState(source);
        return result;
    }
}