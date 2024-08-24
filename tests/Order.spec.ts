import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { InitData, Order, Request, storeJettonTransferNotification, storeRequest } from '../wrappers/Order';
import '@ton/test-utils';
import { Wallet } from '../wrappers/jetton-wallet';
import { Minter } from '../wrappers/jetton-minter';

import { storeJettonTransfer } from '../scripts/jetton-helpers';
import { compile } from '@ton/blueprint';
import { Router, storeInitData } from '../wrappers/Router';

async function checkStage(order: SandboxContract<Order>, seller: SandboxContract<TreasuryContract>, request: Request, open: boolean) {
    const currentState = await order.getState();
    expect(currentState.open).toEqual(open);

    expect(currentState.seller.toString()).toEqual(seller.address.toString());
    expect(currentState.request.order_jetton_sell_wallet.toString()).toEqual(request.order_jetton_sell_wallet.toString());
    expect(currentState.request.order_jetton_buy_wallet.toString()).toEqual(request.order_jetton_buy_wallet.toString());
    expect(currentState.request.jetton_sell_master.toString()).toEqual(request.jetton_sell_master.toString());
    expect(currentState.request.jetton_buy_master.toString()).toEqual(request.jetton_buy_master.toString());
    expect(currentState.request.amount_buy).toEqual(request.amount_buy);
    expect(currentState.request.amount_buy).toEqual(request.amount_buy);
    expect(currentState.request.timeout).toEqual(request.timeout);
}

describe('First stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletDeployer: SandboxContract<Wallet>;
    let sellJettonWalletSeller: SandboxContract<Wallet>;
    let sellJettonWalletBuyer: SandboxContract<Wallet>;
    let sellJettonWalletOrder: SandboxContract<Wallet>;

    let buyJettonWalletDeployer: SandboxContract<Wallet>;
    let buyJettonWalletSeller: SandboxContract<Wallet>;
    let buyJettonWalletBuyer: SandboxContract<Wallet>;
    let buyJettonWalletOrder: SandboxContract<Wallet>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let order: SandboxContract<Order>;

    let sellWalletCode: Cell;
    let buyWalletCode: Cell;
    let sellMinterCode: Cell;
    let buyMinterCode: Cell;

    let sellJettonMaster: Address;
    let buyJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        sellWalletCode = await compile('jetton-wallet');
        buyWalletCode = await compile('jetton-wallet');
        sellMinterCode = await compile('jetton-minter');
        buyMinterCode = await compile('jetton-minter');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

        const sellMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: deployer.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: sellWalletCode,
                    metadata_url: beginCell().storeBit(1).endCell()
                },
                sellMinterCode
            )
        );

        const buyMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: deployer.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: buyWalletCode,
                    metadata_url: beginCell().storeBit(0).endCell()
                },
                buyMinterCode
            )
        );

        sellJettonMaster = sellMinter.address;
        buyJettonMaster = buyMinter.address;

        sellJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: sellJettonMaster },
                sellWalletCode
            )
        );

        buyJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: buyJettonMaster },
                buyWalletCode
            )
        );

        sellJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        sellJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        let master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(sellMinter.address) // from_address
            .storeAddress(deployer.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        const sellMinterDeployResult = await sellMinter.sendMint(deployer.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: deployer.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        expect(sellMinterDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sellMinter.address,
            deploy: true,
            success: true
        });

        expect(sellMinterDeployResult.transactions).toHaveTransaction({
            to: sellJettonWalletDeployer.address,
            deploy: true,
            success: true
        });

        const deployerSellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: toNano(10n),
                destination: seller.address,
                response_destination: seller.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const deployerSellJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerSellTransferBody
        });

        expect(deployerSellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletDeployer.address,
            to: sellJettonWalletSeller.address,
            deploy: true,
            success: true
        });

        master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(buyMinter.address) // from_address
            .storeAddress(deployer.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        const buyMinterDeployResult = await buyMinter.sendMint(deployer.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: deployer.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        expect(buyMinterDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: buyMinter.address,
            deploy: true,
            success: true
        });

        expect(buyMinterDeployResult.transactions).toHaveTransaction({
            to: buyJettonWalletDeployer.address,
            deploy: true,
            success: true
        });

        const deployerBuyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: toNano(10n),
                destination: buyer.address,
                response_destination: buyer.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const deployerBuyJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: buyJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerBuyTransferBody
        });

        expect(deployerBuyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletDeployer.address,
            to: buyJettonWalletBuyer.address,
            deploy: true,
            success: true
        });

        const orderInit: InitData = {
            $$type: 'InitData',
            seller: seller.address,
            nonce: BigInt(Date.now())
        };

        order = blockchain.openContract(await Order.fromInit(orderInit));

        sellJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: order.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: order.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        request = {
            $$type: 'Request',
            order_jetton_sell_wallet: sellJettonWalletOrder.address,
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_sell_master: sellMinter.address,
            jetton_buy_master: buyMinter.address,
            amount_sell: 10n,
            amount_buy: 5n,
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const deployResult = await seller.send(
            {
                value: toNano(0.1),
                to: order.address,
                sendMode: 2,
                init: order.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            deploy: true,
            success: true
        });

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            deploy: true,
            success: true
        });

        printTransactionFees(deployResult.transactions);
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and order are ready to use
        await checkStage(order, seller, request, false);
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: order.address,
            sendMode: 2,
            body: beginCell().endCell()
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 130
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('cancelled message', async () => {
        const cancelTransaction = await order.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            'cancel'
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 133
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('notify from any Wallet', async () => {
        const errNotificationBody = beginCell()
            .store(storeJettonTransferNotification({
                    $$type: 'JettonTransferNotification',
                    query_id: 0n,
                    amount: 5n,
                    sender: seller.address,
                    forward_payload: beginCell().endCell().asSlice()
                }
            ))
            .endCell();

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: order.address,
            sendMode: 2,
            body: errNotificationBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 136
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('notify from errJettonWalletOrder', async () => {
        const errMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: seller.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: await compile('jetton-wallet'),
                    metadata_url: beginCell().endCell()
                },
                await compile('jetton-minter')
            )
        );

        const errJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        let master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(errMinter.address) // from_address
            .storeAddress(seller.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        const errMinterDeployResult = await errMinter.sendMint(seller.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: seller.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        expect(errMinterDeployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: errMinter.address,
            deploy: true,
            success: true
        });

        expect(errMinterDeployResult.transactions).toHaveTransaction({
            to: errJettonWalletSeller.address,
            deploy: true,
            success: true
        });

        const errJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: order.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        const errTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: errJettonWalletSeller.address,
            sendMode: 2,
            body: errTransferBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: errJettonWalletSeller.address,
            to: errJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: errJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 136
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('notify from buyJettonWalletOrder', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const buyJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: buyJettonWalletDeployer.address,
            sendMode: 2,
            body: buyTransferBody
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletDeployer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 40
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('notify from sellJettonWalletOrder -> jetton sender != owner', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const sellJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletDeployer.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 132
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('notify from sellJettonWalletOrder -> jetton sender == owner -> with the wrong amount', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const sellJettonTransferResult = await seller.send({
            value: toNano(1),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletSeller.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 39
        });

        await checkStage(order, seller, request, false);
    }, 100000000);

    it('main flow', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.01),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.1),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletSeller.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: order.address,
            success: true
        });

        printTransactionFees(sellJettonTransferResult.transactions);

        let sellJettonSellerBalance = (await sellJettonWalletSeller.getJettonData())[0];
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0];

        expect(sellJettonOrderBalance).toEqual(request.amount_sell);
        expect(sellJettonSellerBalance).toEqual(9999999990n);

        await checkStage(order, seller, request, true);
    }, 100000000);
});


describe('Second stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletDeployer: SandboxContract<Wallet>;
    let sellJettonWalletSeller: SandboxContract<Wallet>;
    let sellJettonWalletBuyer: SandboxContract<Wallet>;
    let sellJettonWalletOrder: SandboxContract<Wallet>;

    let buyJettonWalletDeployer: SandboxContract<Wallet>;
    let buyJettonWalletSeller: SandboxContract<Wallet>;
    let buyJettonWalletBuyer: SandboxContract<Wallet>;
    let buyJettonWalletOrder: SandboxContract<Wallet>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let order: SandboxContract<Order>;

    let sellWalletCode: Cell;
    let buyWalletCode: Cell;
    let sellMinterCode: Cell;
    let buyMinterCode: Cell;

    let sellJettonMaster: Address;
    let buyJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        sellWalletCode = await compile('jetton-wallet');
        buyWalletCode = await compile('jetton-wallet');
        sellMinterCode = await compile('jetton-minter');
        buyMinterCode = await compile('jetton-minter');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

        const sellMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: deployer.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: sellWalletCode,
                    metadata_url: beginCell().storeBit(1).endCell()
                },
                sellMinterCode
            )
        );

        const buyMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: deployer.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: buyWalletCode,
                    metadata_url: beginCell().storeBit(0).endCell()
                },
                buyMinterCode
            )
        );

        sellJettonMaster = sellMinter.address;
        buyJettonMaster = buyMinter.address;

        sellJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: sellJettonMaster },
                sellWalletCode
            )
        );

        buyJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: buyJettonMaster },
                buyWalletCode
            )
        );

        sellJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        sellJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        let master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(sellMinter.address) // from_address
            .storeAddress(deployer.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        await sellMinter.sendMint(deployer.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: deployer.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        const deployerSellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: toNano(10n),
                destination: seller.address,
                response_destination: seller.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerSellTransferBody
        });

        master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(buyMinter.address) // from_address
            .storeAddress(deployer.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        await buyMinter.sendMint(deployer.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: deployer.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        const deployerBuyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: toNano(10n),
                destination: buyer.address,
                response_destination: buyer.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        await deployer.send({
            value: toNano(1),
            to: buyJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerBuyTransferBody
        });

        // printTransactionFees(minterDeployResult.transactions);
        // prettyLogTransactions(minterDeployResult.transactions);

        const orderInit: InitData = {
            $$type: 'InitData',
            seller: seller.address,
            nonce: BigInt(Date.now())
        };

        order = blockchain.openContract(await Order.fromInit(orderInit));

        sellJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: order.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: order.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        request = {
            $$type: 'Request',
            order_jetton_sell_wallet: sellJettonWalletOrder.address,
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_sell_master: sellMinter.address,
            jetton_buy_master: buyMinter.address,
            amount_sell: 10n,
            amount_buy: 5n,
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        await seller.send(
            {
                value: toNano(0.02),
                to: order.address,
                sendMode: 2,
                bounce: false,
                init: order.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        );

        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.014332),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.031956),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        });

        printTransactionFees(sellJettonTransferResult.transactions);

    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and order are ready to use
        await checkStage(order, seller, request, true);
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: order.address,
            sendMode: 2,
            body: beginCell().endCell()
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 130
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('cancelled message -> sender != owner', async () => {
        const cancelTransaction = await order.send(
            deployer.getSender(),
            {
                value: toNano(1)
            },
            'cancel'
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: deployer.address,
            to: order.address,
            success: false,
            exitCode: 132
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('cancelled message -> sender == owner', async () => {
        const cancelTransaction = await order.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            'cancel'
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: true
        });

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: sellJettonWalletSeller.address,
            success: true
        });

        let sellJettonSellerBalance = (await sellJettonWalletSeller.getJettonData())[0];
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0];

        expect(sellJettonSellerBalance).toEqual(10000000000n);
        expect(sellJettonOrderBalance).toEqual(0n);
    }, 100000000);

    it('notify from any Wallet', async () => {
        const errNotificationBody = beginCell()
            .store(storeJettonTransferNotification({
                    $$type: 'JettonTransferNotification',
                    query_id: 0n,
                    amount: 5n,
                    sender: seller.address,
                    forward_payload: beginCell().endCell().asSlice()
                }
            ))
            .endCell();

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: order.address,
            sendMode: 2,
            body: errNotificationBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 136
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('notify from errJettonWalletOrder', async () => {
        const errMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: seller.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: await compile('jetton-wallet'),
                    metadata_url: beginCell().endCell()
                },
                await compile('jetton-minter')
            )
        );

        const errJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        let master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(errMinter.address) // from_address
            .storeAddress(seller.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        const errMinterDeployResult = await errMinter.sendMint(seller.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: seller.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        expect(errMinterDeployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: errMinter.address,
            deploy: true,
            success: true
        });

        expect(errMinterDeployResult.transactions).toHaveTransaction({
            to: errJettonWalletSeller.address,
            deploy: true,
            success: true
        });

        const errJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: order.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        const errTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: errJettonWalletSeller.address,
            sendMode: 2,
            body: errTransferBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: errJettonWalletSeller.address,
            to: errJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: errJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 136
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('notify from sellJettonWalletOrder', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const sellJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletDeployer.address,
            to: sellJettonWalletOrder.address,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 41
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('notify from buyJettonWalletOrder -> with the wrong timeout', async () => {
        blockchain.now = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 1000;
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const buyJettonTransferResult = await buyer.send({
            value: toNano(1),
            to: buyJettonWalletBuyer.address,
            sendMode: 2,
            body: buyTransferBody
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletBuyer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 42
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('notify from buyJettonWalletOrder -> with the right timeout -> with the wrong amount', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const buyJettonTransferResult = await buyer.send({
            value: toNano(1),
            to: buyJettonWalletBuyer.address,
            sendMode: 2,
            body: buyTransferBody
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletBuyer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 39
        });

        await checkStage(order, seller, request, true);
    }, 100000000);

    it('main flow', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.090113),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const buyJettonTransferResult = await buyer.send({
            value: toNano(0.1072),
            to: buyJettonWalletBuyer.address,
            sendMode: 2,
            body: buyTransferBody
        });

        printTransactionFees(buyJettonTransferResult.transactions);


        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletBuyer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: sellJettonWalletBuyer.address,
            success: true,
            deploy: true
        });

        let sellJettonBuyerBalance = (await sellJettonWalletBuyer.getJettonData())[0];
        let buyJettonBuyerBalance = (await buyJettonWalletBuyer.getJettonData())[0];
        let buyJettonSellerBalance = (await buyJettonWalletSeller.getJettonData())[0];
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0];
        let buyJettonOrderBalance = (await buyJettonWalletOrder.getJettonData())[0];

        expect(sellJettonBuyerBalance).toEqual(request.amount_sell);
        expect(buyJettonSellerBalance).toEqual(request.amount_buy);
        expect(buyJettonBuyerBalance).toEqual(9999999995n);
        expect(sellJettonOrderBalance).toEqual(0n);
        expect(buyJettonOrderBalance).toEqual(0n);
    }, 100000000);
});


describe('Router', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletDeployer: SandboxContract<Wallet>;
    let sellJettonWalletSeller: SandboxContract<Wallet>;
    let sellJettonWalletBuyer: SandboxContract<Wallet>;

    let buyJettonWalletDeployer: SandboxContract<Wallet>;
    let buyJettonWalletSeller: SandboxContract<Wallet>;
    let buyJettonWalletBuyer: SandboxContract<Wallet>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;

    let sellMinter: SandboxContract<Minter>;
    let buyMinter: SandboxContract<Minter>;

    let router: SandboxContract<Router>;

    let sellWalletCode: Cell;
    let buyWalletCode: Cell;
    let sellMinterCode: Cell;
    let buyMinterCode: Cell;

    let sellJettonMaster: Address;
    let buyJettonMaster: Address;

    beforeEach(async () => {
        sellWalletCode = await compile('jetton-wallet');
        buyWalletCode = await compile('jetton-wallet');
        sellMinterCode = await compile('jetton-minter');
        buyMinterCode = await compile('jetton-minter');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

        sellMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: deployer.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: sellWalletCode,
                    metadata_url: beginCell().storeBit(1).endCell()
                },
                sellMinterCode
            )
        );

        buyMinter = blockchain.openContract(
            Minter.createFromConfig(
                {
                    total_supply: 0n,
                    admin_address: deployer.address,
                    next_admin_address: treasury.address,
                    jetton_wallet_code: buyWalletCode,
                    metadata_url: beginCell().storeBit(0).endCell()
                },
                buyMinterCode
            )
        );

        sellJettonMaster = sellMinter.address;
        buyJettonMaster = buyMinter.address;

        sellJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: sellJettonMaster },
                sellWalletCode
            )
        );

        buyJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: buyJettonMaster },
                buyWalletCode
            )
        );

        sellJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        sellJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        buyJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        let master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(sellMinter.address) // from_address
            .storeAddress(deployer.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        await sellMinter.sendMint(deployer.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: deployer.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        const deployerSellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: toNano(10n),
                destination: seller.address,
                response_destination: seller.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerSellTransferBody
        });

        master_msg = beginCell()
            .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
            .storeUint(0, 64) // query_id
            .storeCoins(toNano('1000000')) // jetton_amount
            .storeAddress(buyMinter.address) // from_address
            .storeAddress(deployer.address) // response_address
            .storeCoins(0) // forward_ton_amount
            .storeUint(0, 1) // whether forward_payload or not
            .endCell();

        await buyMinter.sendMint(deployer.getSender(), { // 0x642b7d07
            value: toNano('1.5'),
            queryID: 10,
            toAddress: deployer.address,
            tonAmount: toNano('0.4'),
            master_msg: master_msg
        });

        const deployerBuyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: toNano(10n),
                destination: buyer.address,
                response_destination: buyer.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        await deployer.send({
            value: toNano(1),
            to: buyJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerBuyTransferBody
        });

        router = blockchain.openContract(await Router.fromInit(deployer.address, toNano(0.01), BigInt(Date.now())));

        const routerDeployResult = await deployer.send(
            {
                value: toNano(0.02),
                to: router.address,
                sendMode: 2,
                init: router.init
            }
        );

        expect(routerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: router.address,
            deploy: true,
            success: true
        });
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and order are ready to use
    }, 100000000);

    it('main flow', async () => {
        const sellJettonWalletRouter = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: router.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        const orderInit: InitData = {
            $$type: 'InitData',
            seller: seller.address,
            nonce: BigInt(Date.now())
        };

        const order = blockchain.openContract(Order.fromAddress(await router.getCalculateOrder(orderInit)));
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

        const request: Request = {
            $$type: 'Request',
            order_jetton_sell_wallet: sellJettonWalletOrder.address,
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_sell_master: sellMinter.address,
            jetton_buy_master: buyMinter.address,
            amount_sell: 10n,
            amount_buy: 5n,
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const createOrderBody = beginCell()
            .storeRef(beginCell()
                .store(storeRequest(request))
                .endCell())
            .storeRef(beginCell()
                .store(storeInitData(orderInit))
                .endCell())
            .endCell()
            .asSlice();

        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: router.address,
                response_destination: router.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.08),
                forward_payload: createOrderBody
            }))
            .endCell();

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.1),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletSeller.address,
            to: sellJettonWalletRouter.address,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletRouter.address,
            to: router.address,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: router.address,
            to: order.address,
            success: true,
            deploy: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: router.address,
            to: sellJettonWalletRouter.address,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletRouter.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: order.address,
            success: true
        });
        printTransactionFees(sellJettonTransferResult.transactions);

        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.083313),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const buyJettonTransferResult = await buyer.send({
            value: toNano(0.1),
            to: buyJettonWalletBuyer.address,
            sendMode: 2,
            body: buyTransferBody
        });

        printTransactionFees(buyJettonTransferResult.transactions);


        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletBuyer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: sellJettonWalletBuyer.address,
            success: true,
            deploy: true
        });

        let sellJettonBuyerBalance = (await sellJettonWalletBuyer.getJettonData())[0];
        let buyJettonBuyerBalance = (await buyJettonWalletBuyer.getJettonData())[0];
        let buyJettonSellerBalance = (await buyJettonWalletSeller.getJettonData())[0];
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0];
        let buyJettonOrderBalance = (await buyJettonWalletOrder.getJettonData())[0];

        expect(sellJettonBuyerBalance).toEqual(request.amount_sell);
        expect(buyJettonSellerBalance).toEqual(request.amount_buy);
        expect(buyJettonBuyerBalance).toEqual(9999999995n);
        expect(sellJettonOrderBalance).toEqual(0n);
        expect(buyJettonOrderBalance).toEqual(0n);
    }, 100000000);
});
