import {Blockchain, SandboxContract, TreasuryContract} from "@ton/sandbox";
import {Order, Request} from "../build/Order/tact_Order";
import {Address, Cell, toNano} from "@ton/core";
import {Wallet} from "./jetton-wallet";

export * from '../build/Order/tact_Order';


export async function getOrder(blockchain: Blockchain, seller: SandboxContract<TreasuryContract>, request: Request,
                        sellJettonMaster: Address, buyJettonMaster: Address, sellWalletCode: Cell, buyWalletCode: Cell, isTest=true) {
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

    if (isTest) {
        expect(deployResult.transactions).toHaveTransaction({
            from: seller.address,
            to: order.address,
            deploy: true,
            success: true,
        });
    }

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