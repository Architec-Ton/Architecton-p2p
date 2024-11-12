import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { OrderSellNftToTon, Request, storeRequest } from '../wrappers/OrderSellNftToTon';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { RouterSellNftToTon } from '../wrappers/RouterSellNftToTon';
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

async function checkStage(orderSellNft: SandboxContract<OrderSellNftToTon>, seller: SandboxContract<TreasuryContract>, request: Request, open: boolean) {
    const currentState = await orderSellNft.getState();
    expect(currentState.open).toEqual(open);
    expect(currentState.type).toEqual(3n)

    expect(currentState.seller.toString()).toEqual(seller.address.toString());
    expect(currentState.request.nft_address.toString()).toEqual(request.nft_address.toString());
    expect(currentState.request.amount_buy).toEqual(request.amount_buy);
    expect(currentState.request.expiration_time).toEqual(request.expiration_time);
}

describe('First stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderSellNftToTon: SandboxContract<OrderSellNftToTon>;

    let nftItemCode: Cell;
    let nftCollectionCode: Cell;

    let nftCollection: SandboxContract<Collection>;
    let nftItem: SandboxContract<Item>;

    let request: Request;

    beforeEach(async () => {
        nftItemCode = await compile('nft-item');
        nftCollectionCode = await compile('nft-collection');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

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

        orderSellNftToTon = blockchain.openContract(await OrderSellNftToTon.fromInit(seller.address, BigInt(Date.now())));

        request = {
            $$type: 'Request',
            nft_address: nftItem.address,
            amount_buy: 5n,
            expiration_time: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const deployResult = await seller.send(
            {
                value: toNano(0.1),
                to: orderSellNftToTon.address,
                sendMode: 2,
                init: orderSellNftToTon.init,
                body: beginCell().store(storeRequest(request)).endCell()
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNftToTon.address,
            deploy: true,
            success: true
        });

        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNftToTon.address,
            deploy: true,
            success: true
        });

        printTransactionFees(deployResult.transactions);
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and orderSellNft are ready to use
        await checkStage(orderSellNftToTon, seller, request, false);
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: orderSellNftToTon.address,
            sendMode: 2,
            body: beginCell().endCell()
        });

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: orderSellNftToTon.address,
            success: false,
            exitCode: 130
        });

        await checkStage(orderSellNftToTon, seller, request, false);
    }, 100000000);

    it('cancelled message', async () => {
        const cancelTransaction = await orderSellNftToTon.send(
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
            to: orderSellNftToTon.address,
            success: false,
            exitCode: 133
        });

        await checkStage(orderSellNftToTon, seller, request, false);
    }, 100000000);


    it('nft notify from any wallet', async () => {
        const buyTransferBody = beginCell()
            .storeUint(0x05138d91, 32)
            .storeUint(0, 64)
            .storeSlice(beginCell().storeAddress(seller.address).asSlice())
            .endCell();

        const nftTransferResult = await deployer.send({
            value: toNano(1),
            to: orderSellNftToTon.address,
            sendMode: 2,
            body: buyTransferBody
        });

        expect(nftTransferResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: orderSellNftToTon.address,
            success: true,
        });

        expect(nftTransferResult.transactions).toHaveTransaction({
            from: orderSellNftToTon.address,
            to: deployer.address,
            success: true,
        });

        await checkStage(orderSellNftToTon, seller, request, false);
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
            .storeAddress(orderSellNftToTon.address)
            .storeAddress(orderSellNftToTon.address)
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
            to: orderSellNftToTon.address,
            success: true,
        });

        expect(sellJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNftToTon.address,
            to: nftItemAddress,
            success: true,
        });

        await checkStage(orderSellNftToTon, seller, request, false);
    }, 100000000);

    it('main flow', async () => {
        const sellTransferBody = beginCell()
            .storeUint(0x5fcc3d14, 32)
            .storeUint(0, 64)
            .storeAddress(orderSellNftToTon.address)
            .storeAddress(orderSellNftToTon.address)
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
            to: orderSellNftToTon.address,
            success: true
        });

        printTransactionFees(sellJettonTransferResult.transactions);

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(orderSellNftToTon.address.toRaw())

        await checkStage(orderSellNftToTon, seller, request, true);
    }, 100000000);
});


describe('Second stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderSellNft: SandboxContract<OrderSellNftToTon>;

    let nftItemCode: Cell;
    let nftCollectionCode: Cell;

    let nftCollection: SandboxContract<Collection>;
    let nftItem: SandboxContract<Item>;

    let request: Request;

    beforeEach(async () => {
        nftItemCode = await compile('nft-item');
        nftCollectionCode = await compile('nft-collection');

        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

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

        orderSellNft = blockchain.openContract(await OrderSellNftToTon.fromInit(seller.address, BigInt(Date.now())));

        request = {
            $$type: 'Request',
            nft_address: nftItem.address,
            amount_buy: toNano(5n),
            expiration_time: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 100)
        };

        const deployResult = await seller.send(
            {
                value: toNano(0.05),
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
            .storeCoins(toNano(0.0049))
            .storeBit(0)
            .endCell();

        const res = await seller.send({
            value: toNano(0.006),
            to: nftItem.address,
            sendMode: 2,
            body: sellTransferBody
        });

        expect(res.transactions).toHaveTransaction({
            from: seller.address,
            to: nftItem.address,
            success: true
        })
        expect(res.transactions).toHaveTransaction({
            from: nftItem.address,
            to: orderSellNft.address,
            success: true
        })
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

    it('notify from buyJettonWalletOrder -> with the wrong expiration_time', async () => {
        blockchain.now = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 1000 + 10;
        const buyJettonTransferResult = await buyer.send({
            value: request.amount_buy,
            to: orderSellNft.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeStringTail('transfer ton').endCell()
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: orderSellNft.address,
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: buyer.address,
        });
        printTransactionFees(buyJettonTransferResult.transactions)

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('transfer ton -> with the right expiration_time -> wrong amount', async () => {
        const buyJettonTransferResult = await buyer.send({
            value: request.amount_buy / 2n,
            to: orderSellNft.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeStringTail('transfer ton').endCell()
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: orderSellNft.address,
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: buyer.address,
        });
        printTransactionFees(buyJettonTransferResult.transactions)

        await checkStage(orderSellNft, seller, request, true);
    }, 100000000);

    it('main flow', async () => {
        const buyJettonTransferResult = await buyer.send({
            value: request.amount_buy,
            to: orderSellNft.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeStringTail('transfer ton').endCell()
        });

        printTransactionFees(buyJettonTransferResult.transactions);

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: orderSellNft.address,
            success: true,
            value: request.amount_buy
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: seller.address,
            success: true,
            value: request.amount_buy
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: nftItem.address,
            success: true,
        });

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(buyer.address.toRaw())
    }, 100000000);
});


describe('Router', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let seller: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let orderSellNft: SandboxContract<OrderSellNftToTon>;

    let nftItemCode: Cell;
    let nftCollectionCode: Cell;

    let routerSellNft: SandboxContract<RouterSellNftToTon>;

    let nftCollection: SandboxContract<Collection>;
    let nftItem: SandboxContract<Item>;

    let buyJettonMaster: Address;

    beforeEach(async () => {
        nftItemCode = await compile('nft-item');
        nftCollectionCode = await compile('nft-collection');

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        seller = await blockchain.treasury('seller');
        buyer = await blockchain.treasury('buyer');

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

        routerSellNft = blockchain.openContract(await RouterSellNftToTon.fromInit(deployer.address, toNano(0.01), BigInt(Date.now())));

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
        const orderSellNft = blockchain.openContract(OrderSellNftToTon.fromAddress(await routerSellNft.getCalculateOrder(seller.address, nonce)));

        const request: Request = {
            $$type: 'Request',
            nft_address: nftItem.address,
            amount_buy: toNano(5n),
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
            .storeCoins(toNano(0.01 + 0.01 + 0.01 + 0.01 + 0.01)) // fee + deploy + send_nft + gas
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

        const buyJettonTransferResult = await buyer.send({
            value: request.amount_buy,
            to: orderSellNft.address,
            sendMode: SendMode.PAY_GAS_SEPARATELY ,
            body: beginCell().storeUint(0, 32).storeStringTail('transfer ton').endCell()
        });

        printTransactionFees(buyJettonTransferResult.transactions);

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: orderSellNft.address,
            success: true
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: seller.address,
            success: true,
        });

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: orderSellNft.address,
            to: nftItem.address,
            success: true,
        });

        let [init, index, collection_address, owner, content] = await nftItem.getNftData()
        expect(owner.toRaw()).toEqual(buyer.address.toRaw())
    }, 100000000);
});
