import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { Wallet } from '../wrappers/jetton-wallet';
import { Minter } from '../wrappers/jetton-minter';
import { RouterSellTon, storeTonTransferNotification, TonTransferNotification} from '../wrappers/RouterSellTon';

import { storeJettonTransfer } from '../scripts/jetton-helpers';
import { compile } from '@ton/blueprint';
import { OrderSellTon, Request, InitData, storeJettonTransferNotification, storeRequest } from '../wrappers/OrderSellTon';
import { Order, storeInitData } from '../build/Order/tact_Order';

async function checkStage(order: SandboxContract<OrderSellTon>, seller: SandboxContract<TreasuryContract>, request: Request, open: boolean) {
    const currentState = await order.getState();
    expect(currentState.seller.toString()).toEqual(seller.address.toString());
    expect(currentState.open).toEqual(open);

    expect(currentState.request.order_jetton_buy_wallet.toString()).toEqual(request.order_jetton_buy_wallet.toString());
    expect(currentState.request.jetton_buy_master.toString()).toEqual(request.jetton_buy_master.toString());
    expect(currentState.request.amount_buy).toEqual(request.amount_buy);
    expect(currentState.request.amount_buy).toEqual(request.amount_buy);
    expect(currentState.request.timeout).toEqual(request.timeout);
}

describe('Second stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let buyJettonWalletDeployer: SandboxContract<Wallet>;
    let buyJettonWalletSeller: SandboxContract<Wallet>;
    let buyJettonWalletBuyer: SandboxContract<Wallet>;
    let buyJettonWalletOrder: SandboxContract<Wallet>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderSellTon: SandboxContract<OrderSellTon>;

    let buyWalletCode: Cell;
    let buyMinterCode: Cell;

    let buyJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        buyWalletCode = await compile('jetton-wallet');
        buyMinterCode = await compile('jetton-minter');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

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

        buyJettonMaster = buyMinter.address;

        buyJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: buyJettonMaster },
                buyWalletCode
            )
        );

        buyJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        buyJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        const master_msg = beginCell()
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
        // printTransactionFees(minterDeployResult.transactions);
        // prettyLogTransactions(minterDeployResult.transactions);

        const orderInit: InitData = {
            $$type: 'InitData',
            seller: seller.address,
            time: BigInt(Date.now())
        };
        orderSellTon = blockchain.openContract(await OrderSellTon.fromInit(orderInit));

        buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderSellTon.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        request = {
            $$type: 'Request',
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_buy_master: buyMinter.address,
            amount_sell: toNano(10n),
            amount_buy: 5n,
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const deployResult = await seller.send(
            {
                value: toNano(0.1) + request.amount_sell,
                to: orderSellTon.address,
                sendMode: 2,
                bounce: false,
                init: orderSellTon.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellTon.address,
            deploy: true,
            success: true
        });

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellTon.address,
            deploy: true,
            success: true
        });
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and order are ready to use
        await checkStage(orderSellTon, seller, request, true);
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderSellTon.address,
            sendMode: 2,
            body: beginCell().endCell()
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellTon.address,
            success: false,
            exitCode: 130
        });

        await checkStage(orderSellTon, seller, request, true);
    }, 100000000);

    it('cancelled message -> sender != owner', async () => {
        const cancelTransaction = await orderSellTon.send(
            deployer.getSender(),
            {
                value: toNano(1)
            },
            'cancel'
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: deployer.address,
            to: orderSellTon.address,
            success: false,
            exitCode: 132
        });

        await checkStage(orderSellTon, seller, request, true);
    }, 100000000);

    it('cancelled message -> sender == owner', async () => {
        const cancelTransaction = await orderSellTon.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            'cancel'
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellTon.address,
            success: true
        });

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: orderSellTon.address,
            to: seller.address,
            success: true
        });
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
            to: orderSellTon.address,
            sendMode: 2,
            body: errNotificationBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellTon.address,
            success: false,
            exitCode: 136
        });

        await checkStage(orderSellTon, seller, request, true);
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
                    owner_address: orderSellTon.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        const errTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellTon.address,
                response_destination: orderSellTon.address,
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
            to: orderSellTon.address,
            success: false,
            exitCode: 136
        });

        await checkStage(orderSellTon, seller, request, true);
    }, 100000000);

    it('notify from buyJettonWalletOrder -> with the wrong timeout', async () => {
        blockchain.now = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 1000;
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: orderSellTon.address,
                response_destination: orderSellTon.address,
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
            to: orderSellTon.address,
            success: false,
            exitCode: 42
        });

        await checkStage(orderSellTon, seller, request, true);
    }, 100000000);

    it('notify from buyJettonWalletOrder -> with the right timeout -> with the wrong amount', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: orderSellTon.address,
                response_destination: orderSellTon.address,
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
            to: orderSellTon.address,
            success: false,
            exitCode: 39
        });

        await checkStage(orderSellTon, seller, request, true);
    }, 100000000);

    it('main flow', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellTon.address,
                response_destination: orderSellTon.address,
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
            to: orderSellTon.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellTon.address,
            to: buyer.address,
            success: true,
            value: request.amount_sell
        });

        let buyJettonBuyerBalance = (await buyJettonWalletBuyer.getJettonData())[0];
        let buyJettonSellerBalance = (await buyJettonWalletSeller.getJettonData())[0];
        let buyJettonOrderBalance = (await buyJettonWalletOrder.getJettonData())[0];

        expect(buyJettonSellerBalance).toEqual(request.amount_buy);
        expect(buyJettonBuyerBalance).toEqual(9999999995n);
        expect(buyJettonOrderBalance).toEqual(0n);
    }, 100000000);
});

describe('Router', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let buyJettonWalletDeployer: SandboxContract<Wallet>;
    let buyJettonWalletSeller: SandboxContract<Wallet>;
    let buyJettonWalletBuyer: SandboxContract<Wallet>;
    let buyJettonWalletOrder: SandboxContract<Wallet>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderSellTon: SandboxContract<OrderSellTon>;

    let buyMinter: SandboxContract<Minter>

    let routerSellTon: SandboxContract<RouterSellTon>;

    let buyWalletCode: Cell;
    let buyMinterCode: Cell;

    let buyJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        buyWalletCode = await compile('jetton-wallet');
        buyMinterCode = await compile('jetton-minter');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

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

        buyJettonMaster = buyMinter.address;

        buyJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: deployer.address, jetton_master_address: buyJettonMaster },
                buyWalletCode
            )
        );

        buyJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        buyJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        const master_msg = beginCell()
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
        // printTransactionFees(minterDeployResult.transactions);
        // prettyLogTransactions(minterDeployResult.transactions);

        routerSellTon = blockchain.openContract(await RouterSellTon.fromInit(deployer.address, toNano(0.01), BigInt(Date.now())));

        const routerDeployResult = await deployer.send(
            {
                value: toNano(0.02),
                to: routerSellTon.address,
                sendMode: 2,
                init: routerSellTon.init
            }
        );

        expect(routerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: routerSellTon.address,
            deploy: true,
            success: true
        });

    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and order are ready to use
    }, 100000000);

    it('main flow', async () => {
        const orderInit: InitData = {
            $$type: 'InitData',
            seller: seller.address,
            time: BigInt(Date.now())
        };
        const orderSellTon = blockchain.openContract(OrderSellTon.fromAddress(await routerSellTon.getCalculateOrder(orderInit)));

        const buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderSellTon.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        const request: Request = {
            $$type: 'Request',
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_buy_master: buyMinter.address,
            amount_sell: toNano(10),
            amount_buy: 5n,
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.1) + request.amount_sell,
            to: routerSellTon.address,
            sendMode: 2,
            body: beginCell()
                .store(storeTonTransferNotification({
                    $$type: 'TonTransferNotification',
                    initData: orderInit,
                    request: request
                }))
                .endCell()
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: routerSellTon.address,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: routerSellTon.address,
            to: orderSellTon.address,
            success: true,
            deploy: true
        });

        printTransactionFees(sellJettonTransferResult.transactions);

        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellTon.address,
                response_destination: orderSellTon.address,
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
            to: orderSellTon.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellTon.address,
            to: buyer.address,
            success: true,
            value: request.amount_sell
        });

        let buyJettonBuyerBalance = (await buyJettonWalletBuyer.getJettonData())[0];
        let buyJettonSellerBalance = (await buyJettonWalletSeller.getJettonData())[0];
        let buyJettonOrderBalance = (await buyJettonWalletOrder.getJettonData())[0];

        expect(buyJettonSellerBalance).toEqual(request.amount_buy);
        expect(buyJettonBuyerBalance).toEqual(9999999995n);
        expect(buyJettonOrderBalance).toEqual(0n);
    }, 100000000);
});
