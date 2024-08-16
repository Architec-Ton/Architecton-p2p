import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { OrderBuyTon, Request, storeJettonTransferNotification, storeRequest } from '../wrappers/OrderBuyTon';
import '@ton/test-utils';
import { Wallet } from '../wrappers/jetton-wallet';
import { Minter } from '../wrappers/jetton-minter';

import { storeJettonTransfer } from '../scripts/jetton-helpers';
import { compile } from '@ton/blueprint';

async function checkStage(orderBuyTon: SandboxContract<OrderBuyTon>, seller: SandboxContract<TreasuryContract>, request: Request, open: boolean) {
    const currentState = await orderBuyTon.getState()
    expect(currentState.seller.toString()).toEqual(seller.address.toString())
    expect(currentState.open).toEqual(open)

    expect(currentState.request.order_jetton_sell_wallet.toString()).toEqual(request.order_jetton_sell_wallet.toString())
    expect(currentState.request.jetton_sell_master.toString()).toEqual(request.jetton_sell_master.toString())
    expect(currentState.request.amount_buy).toEqual(request.amount_buy)
    expect(currentState.request.amount_buy).toEqual(request.amount_buy)
    expect(currentState.request.timeout).toEqual(request.timeout)
}

describe('First stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletDeployer: SandboxContract<Wallet>
    let sellJettonWalletSeller: SandboxContract<Wallet>
    let sellJettonWalletBuyer: SandboxContract<Wallet>
    let sellJettonWalletOrder: SandboxContract<Wallet>

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderBuyTon: SandboxContract<OrderBuyTon>;

    let sellWalletCode: Cell;
    let sellMinterCode: Cell;

    let sellJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        sellWalletCode = await compile("jetton-wallet")
        sellMinterCode = await compile('jetton-minter')

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

        sellJettonMaster = sellMinter.address

        sellJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                {owner_address: deployer.address, jetton_master_address: sellJettonMaster},
                sellWalletCode
            )
        );

        sellJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        sellJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
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
            success: true,
        });

        expect(sellMinterDeployResult.transactions).toHaveTransaction({
            to: sellJettonWalletDeployer.address,
            deploy: true,
            success: true,
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
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const deployerSellJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerSellTransferBody
        })

        expect(deployerSellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletDeployer.address,
            to: sellJettonWalletSeller.address,
            deploy: true,
            success: true,
        });

        orderBuyTon = blockchain.openContract(await OrderBuyTon.fromInit(seller.address, deployer.address, BigInt(Math.floor(Date.now() / 1000))));

        sellJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderBuyTon.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        request = {
            $$type: 'Request',
            order_jetton_sell_wallet: sellJettonWalletOrder.address,
            jetton_sell_master: sellMinter.address,
            amount_sell: 10n,
            amount_buy: 5n,
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100),
        }

        const deployResult = await seller.send(
            {
                value: toNano(0.1),
                to: orderBuyTon.address,
                sendMode: 2,
                bounce: false,
                init: orderBuyTon.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        )

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            deploy: true,
            success: true,
        })

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            deploy: true,
            success: true,
        });

        expect(deployResult.transactions).toHaveTransaction({
            from: orderBuyTon.address,
            to: deployer.address,
            success: true,
            value: toNano(0.01)
        });

        printTransactionFees(deployResult.transactions);
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and orderBuyTon are ready to use
        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderBuyTon.address,
            sendMode: 2,
            body: beginCell().endCell()
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 130
        })

        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000)

    it('cancelled message', async () => {
        const cancelTransaction = await orderBuyTon.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            "cancel"
        )

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 133
        })

        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000)

    it('notify from any Wallet', async () => {
        const errNotificationBody = beginCell()
            .store(storeJettonTransferNotification({
                    $$type: 'JettonTransferNotification',
                    query_id: 0n,
                    amount: 5n,
                    sender: seller.address,
                    forward_payload: beginCell().endCell().asSlice(),
                }
            ))
            .endCell()

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderBuyTon.address,
            sendMode: 2,
            body: errNotificationBody
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 136
        })

        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000)

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
            success: true,
        });

        expect(errMinterDeployResult.transactions).toHaveTransaction({
            to: errJettonWalletSeller.address,
            deploy: true,
            success: true,
        });

        const errJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderBuyTon.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        const errTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderBuyTon.address,
                response_destination: orderBuyTon.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: errJettonWalletSeller.address,
            sendMode: 2,
            body: errTransferBody
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: errJettonWalletSeller.address,
            to: errJettonWalletOrder.address,
            deploy: true,
            success: true
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: errJettonWalletOrder.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 136
        })

        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000)

    it('notify from sellJettonWalletOrder -> jetton sender != owner', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: orderBuyTon.address,
                response_destination: orderBuyTon.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const sellJettonTransferResult = await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: sellTransferBody
        })

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletDeployer.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        })

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 132
        })

        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000)

    it('notify from sellJettonWalletOrder -> jetton sender == owner -> with the wrong amount', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: orderBuyTon.address,
                response_destination: orderBuyTon.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const sellJettonTransferResult = await seller.send({
            value: toNano(1),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        })

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletSeller.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        })

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 39
        })

        await checkStage(orderBuyTon, seller, request, false)
    }, 100000000)

    it('main flow', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: orderBuyTon.address,
                response_destination: orderBuyTon.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.01),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.1),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        })

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletSeller.address,
            to: sellJettonWalletOrder.address,
            deploy: true,
            success: true
        })

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: orderBuyTon.address,
            success: true,
        })

        printTransactionFees(sellJettonTransferResult.transactions)

        let sellJettonSellerBalance = (await sellJettonWalletSeller.getJettonData())[0]
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0]

        expect(sellJettonOrderBalance).toEqual(request.amount_sell)
        expect(sellJettonSellerBalance).toEqual(9999999990n)

        await checkStage(orderBuyTon, seller, request, true)
    }, 100000000)
});


describe('Second stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletDeployer: SandboxContract<Wallet>
    let sellJettonWalletSeller: SandboxContract<Wallet>
    let sellJettonWalletBuyer: SandboxContract<Wallet>
    let sellJettonWalletOrder: SandboxContract<Wallet>

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderBuyTon: SandboxContract<OrderBuyTon>;

    let sellWalletCode: Cell;
    let sellMinterCode: Cell;

    let sellJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        sellWalletCode = await compile("jetton-wallet")
        sellMinterCode = await compile('jetton-minter')

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
        
        sellJettonMaster = sellMinter.address

        sellJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                {owner_address: deployer.address, jetton_master_address: sellJettonMaster},
                sellWalletCode
            )
        );
        
        sellJettonWalletSeller = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: seller.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );
        
        sellJettonWalletBuyer = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: buyer.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
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
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerSellTransferBody
        })

        // printTransactionFees(minterDeployResult.transactions);
        // prettyLogTransactions(minterDeployResult.transactions);

        orderBuyTon = blockchain.openContract(await OrderBuyTon.fromInit(seller.address, deployer.address, BigInt(Math.floor(Date.now() / 1000))));

        sellJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderBuyTon.address, jetton_master_address: sellJettonMaster
                },
                sellWalletCode
            )
        );

        request = {
            $$type: 'Request',
            order_jetton_sell_wallet: sellJettonWalletOrder.address,
            jetton_sell_master: sellMinter.address,
            amount_sell: 10n,
            amount_buy: toNano(5n),
            timeout: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100),
        }

        await seller.send(
            {
                value: toNano(0.1),
                to: orderBuyTon.address,
                sendMode: 2,
                bounce: false,
                init: orderBuyTon.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        )

        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: orderBuyTon.address,
                response_destination: orderBuyTon.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.014332),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.031956),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        })

        printTransactionFees(sellJettonTransferResult.transactions)

    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and orderBuyTon are ready to use
        await checkStage(orderBuyTon, seller, request, true)
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderBuyTon.address,
            sendMode: 2,
            body: beginCell().endCell()
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 130
        })

        await checkStage(orderBuyTon, seller, request, true)
    }, 100000000)

    it('cancelled message -> sender != owner', async () => {
        const cancelTransaction = await orderBuyTon.send(
            deployer.getSender(),
            {
                value: toNano(1)
            },
            "cancel"
        )

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: deployer.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 132
        })

        await checkStage(orderBuyTon, seller, request, true)
    }, 100000000)

    it('cancelled message -> sender == owner', async () => {
        const cancelTransaction = await orderBuyTon.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            "cancel"
        )

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            success: true,
        })

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: sellJettonWalletSeller.address,
            success: true,
        })

        let sellJettonSellerBalance = (await sellJettonWalletSeller.getJettonData())[0]
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0]

        expect(sellJettonSellerBalance).toEqual(10000000000n)
        expect(sellJettonOrderBalance).toEqual(0n)
    }, 100000000)

    it('notify from any Wallet', async () => {
        const errNotificationBody = beginCell()
            .store(storeJettonTransferNotification({
                    $$type: 'JettonTransferNotification',
                    query_id: 0n,
                    amount: 5n,
                    sender: seller.address,
                    forward_payload: beginCell().endCell().asSlice(),
                }
            ))
            .endCell()

        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderBuyTon.address,
            sendMode: 2,
            body: errNotificationBody
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 41
        })

        await checkStage(orderBuyTon, seller, request, true)
    }, 100000000)

    it('transfer ton -> wrong amount', async () => {
        const buyJettonTransferResult = await buyer.send({
            value: request.amount_buy / 2n,
            to: orderBuyTon.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeStringTail("transfer ton").endCell()
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: orderBuyTon.address,
            success: false,
            exitCode: 37
        })
    }, 100000000)

    it('main flow', async () => {
        const buyJettonTransferResult = await buyer.send({
            value: request.amount_buy,
            to: orderBuyTon.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeStringTail("transfer ton").endCell()
        })

        printTransactionFees(buyJettonTransferResult.transactions)

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: orderBuyTon.address,
            success: true,
            value: request.amount_buy
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderBuyTon.address,
            to: seller.address,
            success: true,
            value: request.amount_buy
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: sellJettonWalletBuyer.address,
            success: true,
            deploy: true
        })

        let sellJettonBuyerBalance = (await sellJettonWalletBuyer.getJettonData())[0]
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0]

        expect(sellJettonBuyerBalance).toEqual(request.amount_sell)
        expect(sellJettonOrderBalance).toEqual(0n)
    }, 100000000)
});
