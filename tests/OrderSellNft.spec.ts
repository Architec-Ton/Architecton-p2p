import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { OrderSellNft, Request, storeJettonTransferNotification, storeRequest } from '../wrappers/OrderSellNft';
import '@ton/test-utils';
import { Wallet } from '../wrappers/jetton-wallet';
import { Minter } from '../wrappers/jetton-minter';

import { storeJettonTransfer } from '../scripts/jetton-helpers';
import { compile } from '@ton/blueprint';
import { RouterSellNft } from '../wrappers/RouterSellNft';
import { Collection, CollectionConfig } from '../wrappers/nft-collection';
import { Item } from '../wrappers/nft-item';

// message(0x5fcc3d14) Transfer {
//     query_id: Int as uint64;
//     new_owner: Address;
//     response_destination: Address?;
//     custom_payload: Cell?;
//     forward_amount: Int as coins;
//     forward_payload: Slice as remaining;
// }

async function checkStage(orderSellNft: SandboxContract<OrderSellNft>, seller: SandboxContract<TreasuryContract>, request: Request, open: boolean) {
    const currentState = await orderSellNft.getState();
    expect(currentState.open).toEqual(open);
    expect(currentState.type).toEqual(3n)

    expect(currentState.seller.toString()).toEqual(seller.address.toString());
    expect(currentState.request.nft_address.toString()).toEqual(request.nft_address.toString());
    expect(currentState.request.order_jetton_buy_wallet.toString()).toEqual(request.order_jetton_buy_wallet.toString());
    expect(currentState.request.jetton_buy_master.toString()).toEqual(request.jetton_buy_master.toString());
    expect(currentState.request.amount_buy).toEqual(request.amount_buy);
    expect(currentState.request.expiration_time).toEqual(request.expiration_time);
}

describe('First stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let buyJettonWalletDeployer: SandboxContract<Wallet>;
    let buyJettonWalletSeller: SandboxContract<Wallet>;
    let buyJettonWalletBuyer: SandboxContract<Wallet>;
    let buyJettonWalletOrder: SandboxContract<Wallet>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderSellNft: SandboxContract<OrderSellNft>;

    let nftItemCode: Cell;
    let buyWalletCode: Cell;
    let nftCollectionCode: Cell;
    let buyMinterCode: Cell;

    let nftCollection: SandboxContract<Collection>;
    let nftItem: SandboxContract<Item>;

    let buyJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        nftItemCode = await compile('nft-item');
        buyWalletCode = await compile('jetton-wallet');
        nftCollectionCode = await compile('nft-collection');
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

        let master_msg = beginCell()
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

        const defaultConfig: CollectionConfig = {
            ownerAddress: deployer.address,
            nextItemIndex: 777,
            collectionContent: 'collection_content',
            commonContent: 'common_content',
            nftItemCode: new Cell(),
            royaltyParams: {
                royaltyFactor: 100,
                royaltyBase: 200,
                royaltyAddress: deployer.address
            }
        };
        nftCollection = blockchain.openContract(await Collection.createFromConfig(defaultConfig, await compile('nft-collection')));
        const nftCollectionDeploy = await deployer.send(
            {
                value: toNano(0.1),
                to: nftCollection.address,
                sendMode: 2,
                init: nftCollection.init
            }
        );

        expect(nftCollectionDeploy.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: true
        });

        const mintNftBody: Cell = beginCell()
            .storeUint(1, 32)
            .storeUint(0, 64)
            .storeUint(777, 64)
            .storeCoins(toNano(1))
            .storeRef(beginCell()
                .storeAddress(seller.address)
                .storeRef(beginCell().storeBuffer(Buffer.from('azino tri topora')).endCell())
                .endCell())
            .endCell();

        const mintNft = await deployer.send(
            {
                value: toNano(10),
                to: nftCollection.address,
                sendMode: 2,
                body: mintNftBody
            }
        );

        nftItem = blockchain.openContract(Item.createFromAddress(await nftCollection.getNftAddressByIndex(777n)));

        expect(mintNft.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true
        });

        expect(mintNft.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: nftItem.address,
            success: true
        });

        orderSellNft = blockchain.openContract(await OrderSellNft.fromInit(seller.address, BigInt(Date.now())));

        buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderSellNft.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        request = {
            $$type: 'Request',
            nft_address: nftItem.address,
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_buy_master: buyMinter.address,
            amount_buy: 5n,
            expiration_time: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const deployResult = await seller.send(
            {
                value: toNano(0.1),
                to: orderSellNft.address,
                sendMode: 2,
                init: orderSellNft.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            deploy: true,
            success: true
        });

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            deploy: true,
            success: true
        });

        printTransactionFees(deployResult.transactions);
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and orderSellNft are ready to use
        await checkStage(orderSellNft, seller, request, false);
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderSellNft.address,
            sendMode: 2,
            body: beginCell().endCell()
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 130
        });

        await checkStage(orderSellNft, seller, request, false);
    }, 100000000);

    it('cancelled message', async () => {
        const cancelTransaction = await orderSellNft.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            {
                $$type: 'Cancel'
            }
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 133
        });

        await checkStage(orderSellNft, seller, request, false);
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
            to: orderSellNft.address,
            sendMode: 2,
            body: errNotificationBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 40
        });

        await checkStage(orderSellNft, seller, request, false);
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
                    owner_address: orderSellNft.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        const errTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
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
            to: orderSellNft.address,
            success: false,
            exitCode: 40
        });

        await checkStage(orderSellNft, seller, request, false);
    }, 100000000);

    it('nft notify from any wallet', async () => {
        const buyTransferBody = beginCell()
            .storeUint(0x05138d91, 32)
            .storeUint(0, 64)
            .storeSlice(beginCell().storeAddress(seller.address).asSlice())
            .endCell();

        const nftTransferResult = await deployer.send({
            value: toNano(1),
            to: orderSellNft.address,
            sendMode: 2,
            body: buyTransferBody
        });

        expect(nftTransferResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 136
        });

        await checkStage(orderSellNft, seller, request, false);
    }, 100000000);

    it('nft notify from any nft', async () => {
        const mintNftBody: Cell = beginCell()
            .storeUint(1, 32)
            .storeUint(0, 64)
            .storeUint(778, 64)
            .storeCoins(toNano(1))
            .storeRef(beginCell()
                .storeAddress(seller.address)
                .storeRef(beginCell().storeBuffer(Buffer.from('bad nft')).endCell())
                .endCell())
            .endCell();

        await deployer.send(
            {
                value: toNano(10),
                to: nftCollection.address,
                sendMode: 2,
                body: mintNftBody
            }
        );

        const nftItemAddress = await nftCollection.getNftAddressByIndex(778n);

        const sellTransferBody = beginCell()
            .storeUint(0x5fcc3d14, 32)
            .storeUint(0, 64)
            .storeAddress(orderSellNft.address)
            .storeAddress(orderSellNft.address)
            .storeBit(0)
            .storeCoins(toNano(0.1))
            .storeBit(0)
            .endCell();

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.2),
            to: nftItemAddress,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: nftItemAddress,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: nftItemAddress,
            to: orderSellNft.address,
            success: false,
            exitCode: 136
        });

        await checkStage(orderSellNft, seller, request, false);
    }, 100000000);

    it('main flow', async () => {
        const sellTransferBody = beginCell()
            .storeUint(0x5fcc3d14, 32)
            .storeUint(0, 64)
            .storeAddress(orderSellNft.address)
            .storeAddress(orderSellNft.address)
            .storeBit(0)
            .storeCoins(toNano(0.1))
            .storeBit(0)
            .endCell();

        const sellJettonTransferResult = await seller.send({
            value: toNano(0.2),
            to: nftItem.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: nftItem.address,
            success: true
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: nftItem.address,
            to: orderSellNft.address,
            success: true
        });

        printTransactionFees(sellJettonTransferResult.transactions);

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(orderSellNft.address.toRaw())

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);
});


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
    let orderSellNft: SandboxContract<OrderSellNft>;

    let nftItemCode: Cell;
    let buyWalletCode: Cell;
    let nftCollectionCode: Cell;
    let buyMinterCode: Cell;

    let nftCollection: SandboxContract<Collection>;
    let nftItem: SandboxContract<Item>;

    let buyJettonMaster: Address;

    let request: Request;

    beforeEach(async () => {
        nftItemCode = await compile('nft-item');
        buyWalletCode = await compile('jetton-wallet');
        nftCollectionCode = await compile('nft-collection');
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

        let master_msg = beginCell()
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

        const defaultConfig: CollectionConfig = {
            ownerAddress: deployer.address,
            nextItemIndex: 777,
            collectionContent: 'collection_content',
            commonContent: 'common_content',
            nftItemCode: new Cell(),
            royaltyParams: {
                royaltyFactor: 100,
                royaltyBase: 200,
                royaltyAddress: deployer.address
            }
        };
        nftCollection = blockchain.openContract(await Collection.createFromConfig(defaultConfig, await compile('nft-collection')));
        await deployer.send(
            {
                value: toNano(0.05),
                to: nftCollection.address,
                sendMode: 2,
                init: nftCollection.init
            }
        );

        const mintNftBody: Cell = beginCell()
            .storeUint(1, 32)
            .storeUint(0, 64)
            .storeUint(777, 64)
            .storeCoins(toNano(0.06))
            .storeRef(beginCell()
                .storeAddress(seller.address)
                .storeRef(beginCell().storeBuffer(Buffer.from('azino tri topora')).endCell())
                .endCell())
            .endCell();

        await deployer.send(
            {
                value: toNano(0.061),
                to: nftCollection.address,
                sendMode: 2,
                body: mintNftBody
            }
        );

        nftItem = blockchain.openContract(Item.createFromAddress(await nftCollection.getNftAddressByIndex(777n)));

        orderSellNft = blockchain.openContract(await OrderSellNft.fromInit(seller.address, BigInt(Date.now())));

        buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderSellNft.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        request = {
            $$type: 'Request',
            nft_address: nftItem.address,
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_buy_master: buyMinter.address,
            amount_buy: 5n,
            expiration_time: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const deployResult = await seller.send(
            {
                value: toNano(0.1),
                to: orderSellNft.address,
                sendMode: 2,
                init: orderSellNft.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        );

        printTransactionFees(deployResult.transactions);

        const sellTransferBody = beginCell()
            .storeUint(0x5fcc3d14, 32)
            .storeUint(0, 64)
            .storeAddress(orderSellNft.address)
            .storeAddress(null)
            .storeBit(0)
            .storeCoins(toNano(0.0042))
            .storeBit(0)
            .endCell();

        await seller.send({
            value: toNano(0.005),
            to: nftItem.address,
            sendMode: 2,
            body: sellTransferBody
        });
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and orderSellNft are ready to use
        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderSellNft.address,
            sendMode: 2,
            body: beginCell().endCell()
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 130
        });

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('cancelled message -> sender != owner', async () => {
        const cancelTransaction = await orderSellNft.send(
            deployer.getSender(),
            {
                value: toNano(1)
            },
            {
                $$type: 'Cancel'
            }
        );

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: deployer.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 132
        });

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('cancelled message -> sender == owner', async () => {
        const cancelTransaction = await orderSellNft.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            {
                $$type: 'Cancel'
            }
        );

        console.log(nftItem.address)
        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            success: true
        });

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: nftItem.address,
            success: true
        });

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(seller.address.toRaw())
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
            to: orderSellNft.address,
            sendMode: 2,
            body: errNotificationBody
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNft.address,
            success: false,
            exitCode: 136
        });

        await checkStage(orderSellNft, seller, request, true);
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
                    owner_address: orderSellNft.address, jetton_master_address: errMinter.address
                },
                await compile('jetton-wallet')
            )
        );

        const errTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
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
            to: orderSellNft.address,
            success: false,
            exitCode: 136
        });

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('notify from sellJettonWalletOrder', async () => {
        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        // const sellJettonTransferResult = await deployer.send({
        //     value: toNano(1),
        //     to: sellJettonWalletDeployer.address,
        //     sendMode: 2,
        //     body: sellTransferBody
        // });
        //
        // expect(sellJettonTransferResult.transactions).toHaveTransaction({
        //     from: sellJettonWalletDeployer.address,
        //     to: sellJettonWalletOrder.address,
        //     success: true
        // });
        //
        // expect(sellJettonTransferResult.transactions).toHaveTransaction({
        //     from: sellJettonWalletOrder.address,
        //     to: orderSellNft.address,
        //     success: false,
        //     exitCode: 41
        // });

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('notify from buyJettonWalletOrder -> with the wrong expiration_time', async () => {
        blockchain.now = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 1000;
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
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
            to: orderSellNft.address,
            success: false,
            exitCode: 42
        });

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('notify from buyJettonWalletOrder -> with the right expiration_time -> with the wrong amount', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
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
            to: orderSellNft.address,
            success: false,
            exitCode: 39
        });

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('main flow', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
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
            to: orderSellNft.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: nftItem.address,
            success: true,
        });

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(buyer.address.toRaw())


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
    let orderSellNft: SandboxContract<OrderSellNft>;

    let nftItemCode: Cell;
    let buyWalletCode: Cell;
    let nftCollectionCode: Cell;
    let buyMinterCode: Cell;

    let routerSellNft: SandboxContract<RouterSellNft>;

    let nftCollection: SandboxContract<Collection>;
    let nftItem: SandboxContract<Item>;

    let buyJettonMaster: Address;

    beforeEach(async () => {
        nftItemCode = await compile('nft-item');
        buyWalletCode = await compile('jetton-wallet');
        nftCollectionCode = await compile('nft-collection');
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

        let master_msg = beginCell()
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

        const defaultConfig: CollectionConfig = {
            ownerAddress: deployer.address,
            nextItemIndex: 777,
            collectionContent: 'collection_content',
            commonContent: 'common_content',
            nftItemCode: new Cell(),
            royaltyParams: {
                royaltyFactor: 100,
                royaltyBase: 200,
                royaltyAddress: deployer.address
            }
        };
        nftCollection = blockchain.openContract(await Collection.createFromConfig(defaultConfig, await compile('nft-collection')));
        await deployer.send(
            {
                value: toNano(0.05),
                to: nftCollection.address,
                sendMode: 2,
                init: nftCollection.init
            }
        );

        const mintNftBody: Cell = beginCell()
            .storeUint(1, 32)
            .storeUint(0, 64)
            .storeUint(777, 64)
            .storeCoins(toNano(0.06))
            .storeRef(beginCell()
                .storeAddress(seller.address)
                .storeRef(beginCell().storeBuffer(Buffer.from('azino tri topora')).endCell())
                .endCell())
            .endCell();

        await deployer.send(
            {
                value: toNano(0.061),
                to: nftCollection.address,
                sendMode: 2,
                body: mintNftBody
            }
        );

        nftItem = blockchain.openContract(Item.createFromAddress(await nftCollection.getNftAddressByIndex(777n)));

        routerSellNft = blockchain.openContract(await RouterSellNft.fromInit(deployer.address, toNano(0.01), BigInt(Date.now())));

        const routerDeployResult = await deployer.send(
            {
                value: toNano(0.02),
                to: routerSellNft.address,
                sendMode: 2,
                init: routerSellNft.init
            }
        );

        expect(routerDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: routerSellNft.address,
            deploy: true,
            success: true
        });
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and orderSellNft are ready to use
    }, 100000000);

    it('main flow', async () => {
        const nonce = BigInt(Date.now())
        const orderSellNft = blockchain.openContract(OrderSellNft.fromAddress(await routerSellNft.getCalculateOrder(seller.address, nonce)));
        const buyJettonWalletOrder = blockchain.openContract(
            Wallet.createFromConfig({
                    owner_address: orderSellNft.address, jetton_master_address: buyJettonMaster
                },
                buyWalletCode
            )
        );

        const request: Request = {
            $$type: 'Request',
            nft_address: nftItem.address,
            order_jetton_buy_wallet: buyJettonWalletOrder.address,
            jetton_buy_master: buyJettonMaster,
            amount_buy: 5n,
            expiration_time: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const createOrderBody = beginCell()
            .storeRef(beginCell()
                .store(storeRequest(request))
                .endCell())
            .storeRef(beginCell()
                .storeAddress(seller.address)
                .storeInt(nonce, 257)
                .endCell())
            .endCell()
            .asSlice();

        const sellTransferBody = beginCell()
            .storeUint(0x5fcc3d14, 32)
            .storeUint(0, 64)
            .storeAddress(routerSellNft.address)
            .storeAddress(null)
            .storeBit(0)
            .storeCoins(toNano(0.01 + 0.01 + 0.01 + 0.01)) // fee + deploy + send_nft + gas
            .storeBit(1)
            .storeSlice(createOrderBody)
            .endCell();

        const sellTransferResult = await seller.send({
            value: toNano(0.1), // nft_response(0.04) + storage(0.05 from contract) + gas
            to: nftItem.address,
            sendMode: 2,
            body: sellTransferBody
        });

        printTransactionFees(sellTransferResult.transactions);
        expect(sellTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: nftItem.address,
            success: true
        });

        expect(sellTransferResult.transactions).toHaveTransaction({
            from: nftItem.address,
            to: routerSellNft.address,
            success: true
        });

        expect(sellTransferResult.transactions).toHaveTransaction({
            from: routerSellNft.address,
            to: orderSellNft.address,
            success: true,
            deploy: true
        });

        expect(sellTransferResult.transactions).toHaveTransaction({
            from: routerSellNft.address,
            to: nftItem.address,
            success: true
        });

        expect(sellTransferResult.transactions).toHaveTransaction({
            from: nftItem.address,
            to: orderSellNft.address,
            success: true
        });


        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: orderSellNft.address,
                response_destination: orderSellNft.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.043313),
                forward_payload: beginCell().endCell().asSlice()
            }))
            .endCell();

        const buyJettonTransferResult = await buyer.send({
            value: toNano(0.06),
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
            to: orderSellNft.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: nftItem.address,
            success: true,
        });

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(buyer.address.toRaw())


        let buyJettonBuyerBalance = (await buyJettonWalletBuyer.getJettonData())[0];
        let buyJettonSellerBalance = (await buyJettonWalletSeller.getJettonData())[0];
        let buyJettonOrderBalance = (await buyJettonWalletOrder.getJettonData())[0];

        expect(buyJettonSellerBalance).toEqual(request.amount_buy);
        expect(buyJettonBuyerBalance).toEqual(9999999995n);
        expect(buyJettonOrderBalance).toEqual(0n);
    }, 100000000);
});
