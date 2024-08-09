import {Blockchain, prettyLogTransactions, printTransactionFees, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, Slice, toNano} from '@ton/core';
import {Order, Request, storeJettonTransferNotification} from '../wrappers/Order';
import '@ton/test-utils';
import {Wallet} from "../wrappers/jetton-wallet";
import {Minter} from "../wrappers/jetton-minter";

import {buildOnchainMetadata, storeJettonTransfer} from "../scripts/jetton-helpers";
import {compile} from "@ton/blueprint";

const sellJettonParams = {
    name: "test USDT",
    description: "This is description for test USDT",
    symbol: "testUSDT",
    image: "https://i.ibb.co/J3rk47X/USDT-ocean.webp"
};
let sellJettonContentMetadata = buildOnchainMetadata(sellJettonParams);

const buyJettonParams = {
    name: "test NOT",
    description: "This is description for test NOT",
    symbol: "testNOT",
    image: "https://i.ibb.co/J3rk47X/NOT-ocean.webp"
};
let buyJettonContentMetadata = buildOnchainMetadata(buyJettonParams);


// const sellCode = Cell.fromBadse64('te6ccgEBAQEAIwAIQgKPRS16Tf10BmtoI2UXclntBXNENb52tf1L1divK3w9aA==')
// const buyCode = Cell.fromBase64('te6ccgEBAQEAIwAIQgK6KRjIlH6bJa+awbiDNXdUFz5YEvgHo9bmQqFHCVlTlQ==')


// const jettonSellMaster = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
// const jettonBuyMaster = Address.parse('EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT')


async function getOrder(blockchain: Blockchain, seller: SandboxContract<TreasuryContract>, request: Request,
                        sellJettonMaster: Address, buyJettonMaster: Address, sellWalletCode: Cell, buyWalletCode: Cell) {
    const order = blockchain.openContract(await Order.fromInit(seller.address, request, BigInt(Math.floor(Date.now() / 1000))));

    const deployResult = await order.send(
        seller.getSender(),
        {
            value: toNano('0.2'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    expect(deployResult.transactions).toHaveTransaction({
        from: seller.address,
        to: order.address,
        deploy: true,
        success: true,
    });

    const sellJettonWalletOrder = blockchain.openContract(
        Wallet.createFromConfig({
                owner_address: order.address, jetton_master_address: sellJettonMaster
            },
            sellWalletCode
        )
    );

    const buyJettonWalletOrder = blockchain.openContract(
        Wallet.createFromConfig({
                owner_address: order.address, jetton_master_address: buyJettonMaster
            },
            buyWalletCode
        )
    );

    return {order, sellJettonWalletOrder, buyJettonWalletOrder}
}


describe('Order', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletSeller: SandboxContract<Wallet>
    let sellJettonWalletBuyer: SandboxContract<Wallet>

    let buyJettonWalletSeller: SandboxContract<Wallet>
    let buyJettonWalletBuyer: SandboxContract<Wallet>

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;

    let sellWalletCode: Cell;
    let buyWalletCode: Cell;
    let sellMinterCode: Cell;
    let buyMinterCode: Cell;

    let sellJettonMaster: Address;
    let buyJettonMaster: Address;

    beforeEach(async () => {}, 100000000);

});
