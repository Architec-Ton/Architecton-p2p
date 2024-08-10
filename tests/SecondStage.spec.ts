import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, toNano} from '@ton/core';
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


describe('Second stage', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;

    let sellJettonWalletDeployer: SandboxContract<Wallet>
    let sellJettonWalletSeller: SandboxContract<Wallet>
    let sellJettonWalletBuyer: SandboxContract<Wallet>
    let sellJettonWalletOrder: SandboxContract<Wallet>

    let buyJettonWalletDeployer: SandboxContract<Wallet>
    let buyJettonWalletSeller: SandboxContract<Wallet>
    let buyJettonWalletBuyer: SandboxContract<Wallet>
    let buyJettonWalletOrder: SandboxContract<Wallet>

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
        sellWalletCode = await compile("jetton-wallet")//Cell.fromBoc(Buffer.from('b5ee9c72010101010023000842028f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68', "hex"))[0]
        buyWalletCode = await compile('jetton-wallet')
        sellMinterCode = await compile('jetton-minter');//Cell.fromBoc(Buffer.from('b5ee9c72010218010005bb000114ff00f4a413f4bcf2c80b0102016202030202cb0405020120141502f3d0cb434c0c05c6c238ecc200835c874c7c0608405e351466ea44c38601035c87e800c3b51343e803e903e90353534541168504d3214017e809400f3c58073c5b333327b55383e903e900c7e800c7d007e800c7e80004c5c3e0e80b4c7c04074cfc044bb51343e803e903e9035353449a084190adf41eeb8c089a0607001da23864658380e78b64814183fa0bc0019635355161c705f2e04904fa4021fa4430c000f2e14dfa00d4d120d0d31f018210178d4519baf2e0488040d721fa00fa4031fa4031fa0020d70b009ad74bc00101c001b0f2b19130e254431b0803fa82107bdd97deba8ee7363805fa00fa40f82854120a70546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d05008c705f2e04a12a14414506603c85005fa025003cf1601cf16ccccc9ed54fa40d120d70b01c000b3915be30de02682102c76b973bae30235250a0b0c018e2191729171e2f839206e938124279120e2216e94318128739101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b025597f0900ec82103b9aca0070fb02f828450470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d0c8801801cb0501cf1658fa02029858775003cb6bcccc9730017158cb6acce2c98011fb005005a04314c85005fa025003cf1601cf16ccccc9ed540044c8801001cb0501cf1670fa027001cb6a8210d53276db01cb1f0101cb3fc98042fb0001fc145f04323401fa40d2000101d195c821cf16c9916de2c8801001cb055004cf1670fa027001cb6a8210d173540001cb1f500401cb3f23fa4430c0008e35f828440470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d012cf1697316c127001cb01e2f400c90d04f882106501f354ba8e223134365145c705f2e04902fa40d1103402c85005fa025003cf1601cf16ccccc9ed54e0258210fb88e119ba8e2132343603d15131c705f2e0498b025512c85005fa025003cf1601cf16ccccc9ed54e034248210235caf52bae30237238210cb862902bae302365b2082102508d66abae3026c310e0f101100088050fb0002ec3031325033c705f2e049fa40fa00d4d120d0d31f01018040d7212182100f8a7ea5ba8e4d36208210595f07bcba8e2c3004fa0031fa4031f401d120f839206e943081169fde718102f270f8380170f836a0811a7770f836a0bcf2b08e138210eed236d3ba9504d30331d19434f2c048e2e2e30d50037012130044335142c705f2e049c85003cf16c9134440c85005fa025003cf1601cf16ccccc9ed54001e3002c705f2e049d4d4d101ed54fb0400188210d372158cbadc840ff2f000ce31fa0031fa4031fa4031f401fa0020d70b009ad74bc00101c001b0f2b19130e25442162191729171e2f839206e938124279120e2216e94318128739101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b000c082103b9aca0070fb02f828450470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d0c8801801cb0501cf1658fa02029858775003cb6bcccc9730017158cb6acce2c98011fb000025bd9adf6a2687d007d207d206a6a6888122f82402027116170085adbcf6a2687d007d207d206a6a688a2f827c1400b82a3002098a81e46581ac7d0100e78b00e78b6490e4658089fa00097a00658064fc80383a6465816503e5ffe4e84000cfaf16f6a2687d007d207d206a6a68bf99e836c1783872ebdb514d9c97c283b7f0ae5179029e2b6119c39462719e4f46ed8f7413e62c780a417877407e978f01a40711411b1acb773a96bdd93fa83bb5ca8435013c8c4b3ac91f4589b4780a38646583fa0064a18040', "hex"))[0]
        buyMinterCode = Cell.fromBoc(Buffer.from('b5ee9c72010218010005bb000114ff00f4a413f4bcf2c80b0102016202030202cb0405020120141502f3d0cb434c0c05c6c238ecc200835c874c7c0608405e351466ea44c38601035c87e800c3b51343e803e903e90353534541168504d3214017e809400f3c58073c5b333327b55383e903e900c7e800c7d007e800c7e80004c5c3e0e80b4c7c04074cfc044bb51343e803e903e9035353449a084190adf41eeb8c089a0607001da23864658380e78b64814183fa0bc0019635355161c705f2e04904fa4021fa4430c000f2e14dfa00d4d120d0d31f018210178d4519baf2e0488040d721fa00fa4031fa4031fa0020d70b009ad74bc00101c001b0f2b19130e254431b0803fa82107bdd97deba8ee7363805fa00fa40f82854120a70546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d05008c705f2e04a12a14414506603c85005fa025003cf1601cf16ccccc9ed54fa40d120d70b01c000b3915be30de02682102c76b973bae30235250a0b0c018e2191729171e2f839206e938124279120e2216e94318128739101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b025597f0900ec82103b9aca0070fb02f828450470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d0c8801801cb0501cf1658fa02029858775003cb6bcccc9730017158cb6acce2c98011fb005005a04314c85005fa025003cf1601cf16ccccc9ed540044c8801001cb0501cf1670fa027001cb6a8210d53276db01cb1f0101cb3fc98042fb0001fc145f04323401fa40d2000101d195c821cf16c9916de2c8801001cb055004cf1670fa027001cb6a8210d173540001cb1f500401cb3f23fa4430c0008e35f828440470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d012cf1697316c127001cb01e2f400c90d04f882106501f354ba8e223134365145c705f2e04902fa40d1103402c85005fa025003cf1601cf16ccccc9ed54e0258210fb88e119ba8e2132343603d15131c705f2e0498b025512c85005fa025003cf1601cf16ccccc9ed54e034248210235caf52bae30237238210cb862902bae302365b2082102508d66abae3026c310e0f101100088050fb0002ec3031325033c705f2e049fa40fa00d4d120d0d31f01018040d7212182100f8a7ea5ba8e4d36208210595f07bcba8e2c3004fa0031fa4031f401d120f839206e943081169fde718102f270f8380170f836a0811a7770f836a0bcf2b08e138210eed236d3ba9504d30331d19434f2c048e2e2e30d50037012130044335142c705f2e049c85003cf16c9134440c85005fa025003cf1601cf16ccccc9ed54001e3002c705f2e049d4d4d101ed54fb0400188210d372158cbadc840ff2f000ce31fa0031fa4031fa4031f401fa0020d70b009ad74bc00101c001b0f2b19130e25442162191729171e2f839206e938124279120e2216e94318128739101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b000c082103b9aca0070fb02f828450470546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d0c8801801cb0501cf1658fa02029858775003cb6bcccc9730017158cb6acce2c98011fb000025bd9adf6a2687d007d207d206a6a6888122f82402027116170085adbcf6a2687d007d207d206a6a688a2f827c1400b82a3002098a81e46581ac7d0100e78b00e78b6490e4658089fa00097a00658064fc80383a6465816503e5ffe4e84000cfaf16f6a2687d007d207d206a6a68bf99e836c1783872ebdb514d9c97c283b7f0ae5179029e2b6119c39462719e4f46ed8f7413e62c780a417877407e978f01a40711411b1acb773a96bdd93fa83bb5ca8435013c8c4b3ac91f4589b4780a38646583fa0064a18040', "hex"))[0]

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
                    metadata_url: sellJettonContentMetadata
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
                    metadata_url: buyJettonContentMetadata
                },
                buyMinterCode
            )
        );

        sellJettonMaster = sellMinter.address
        buyJettonMaster = buyMinter.address

        sellJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                {owner_address: deployer.address, jetton_master_address: sellJettonMaster},
                sellWalletCode
            )
        );

        buyJettonWalletDeployer = blockchain.openContract(
            Wallet.createFromConfig(
                {owner_address: deployer.address, jetton_master_address: buyJettonMaster},
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
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        await deployer.send({
            value: toNano(1),
            to: sellJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerSellTransferBody
        })

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
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        await deployer.send({
            value: toNano(1),
            to: buyJettonWalletDeployer.address,
            sendMode: 2,
            body: deployerBuyTransferBody
        })

        // printTransactionFees(minterDeployResult.transactions);
        // prettyLogTransactions(minterDeployResult.transactions);

        request = {
            $$type: 'Request',
            jetton_sell_code: sellWalletCode,
            jetton_buy_code: buyWalletCode,
            amount_sell: 10n,
            amount_buy: 5n,
            jetton_sell_master: sellJettonMaster,
            jetton_buy_master: buyJettonMaster,
        }

        order = blockchain.openContract(await Order.fromInit(seller.address, request, BigInt(Math.floor(Date.now() / 1000))));
        await order.send(
            seller.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

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

        const sellTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 10n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        await seller.send({
            value: toNano(1),
            to: sellJettonWalletSeller.address,
            sendMode: 2,
            body: sellTransferBody
        })
    }, 100000000);

    it('should deploy & mint & transfer jettons', async () => {
        // the check is done inside beforeEach
        // blockchain and order are ready to use
    }, 100000000);

    it('another err message', async () => {
        const errJettonTransferResult = await seller.send({
            value: toNano(1),
            to: order.address,
            sendMode: 2,
            body: beginCell().endCell()
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 130
        })
    }, 100000000)

    it('cancelled message -> sender != owner', async () => {
        const cancelTransaction = await order.send(
            deployer.getSender(),
            {
                value: toNano(1)
            },
            "cancel"
        )

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: deployer.address,
            to: order.address,
            success: false,
            exitCode: 132
        })
    }, 100000000)

    it('cancelled message -> sender == owner', async () => {
        const cancelTransaction = await order.send(
            seller.getSender(),
            {
                value: toNano(1)
            },
            "cancel"
        )

        expect(cancelTransaction.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
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
            to: order.address,
            sendMode: 2,
            body: errNotificationBody
        })

        expect(errJettonTransferResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            success: false,
            exitCode: 136
        })
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
            to: order.address,
            success: false,
            exitCode: 136
        })
    }, 100000000)

    // todo: узнать что делать
    
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
            to: order.address,
            success: false,
            exitCode: 41242
        })
    }, 100000000)

    it('notify from buyJettonWalletOrder -> with the wrong amount', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 9n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const buyJettonTransferResult = await buyer.send({
            value: toNano(1),
            to: buyJettonWalletBuyer.address,
            sendMode: 2,
            body: buyTransferBody
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletBuyer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: false,
            exitCode: 39
        })
    }, 100000000)

    it('main flow', async () => {
        const buyTransferBody = beginCell()
            .store(storeJettonTransfer({
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 5n,
                destination: order.address,
                response_destination: order.address,
                custom_payload: beginCell().endCell(),
                forward_ton_amount: toNano(0.1),
                forward_payload: beginCell().endCell().asSlice(),
            }))
            .endCell()

        const buyJettonTransferResult = await buyer.send({
            value: toNano(1),
            to: buyJettonWalletBuyer.address,
            sendMode: 2,
            body: buyTransferBody
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletBuyer.address,
            to: buyJettonWalletOrder.address,
            deploy: true,
            success: true
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: order.address,
            success: true
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: buyJettonWalletOrder.address,
            to: buyJettonWalletSeller.address,
            success: true,
            deploy: true
        })

        expect(buyJettonTransferResult.transactions).toHaveTransaction({
            from: sellJettonWalletOrder.address,
            to: sellJettonWalletBuyer.address,
            success: true,
            deploy: true
        })

        let sellJettonBuyerBalance = (await sellJettonWalletBuyer.getJettonData())[0]
        let buyJettonBuyerBalance = (await buyJettonWalletBuyer.getJettonData())[0]
        let buyJettonSellerBalance = (await buyJettonWalletSeller.getJettonData())[0]
        let sellJettonOrderBalance = (await sellJettonWalletOrder.getJettonData())[0]
        let buyJettonOrderBalance = (await buyJettonWalletOrder.getJettonData())[0]

        expect(sellJettonBuyerBalance).toEqual(request.amount_sell)
        expect(buyJettonSellerBalance).toEqual(request.amount_buy)
        expect(buyJettonBuyerBalance).toEqual(9999999995n)
        expect(sellJettonOrderBalance).toEqual(0n)
        expect(buyJettonOrderBalance).toEqual(0n)
    }, 100000000)
});
