import { beginCell, toNano } from '@ton/core';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';
import { Minter } from '../wrappers/jetton-minter';
import { Wallet } from '../wrappers/jetton-wallet';
import { buildOnchainMetadata } from './jetton-helpers';

export async function run(provider: NetworkProvider) {
    const JettonWalletCode = await compile('jetton-wallet');
    const JettonMinterCode = await compile('jetton-minter');

    const jettonParams = {
        name: "test USDT",
        description: "This is description for test USDT",
        symbol: "testUSDT",
        image: "https://i.ibb.co/J3rk47X/USDT-ocean.webp",
        decimals: "6"
    };

    let jetton_content_metadata = buildOnchainMetadata(jettonParams);

    const JettonMinter = provider.open(
        Minter.createFromConfig(
            {
                total_supply: 0n,
                admin_address: provider.sender().address!,
                next_admin_address: provider.sender().address!,
                jetton_wallet_code: JettonWalletCode,
                metadata_url: jetton_content_metadata
            },
            JettonMinterCode
        )
    );

    const JettonWalletDeployer = provider.open(
        Wallet.createFromConfig(
            { owner_address: provider.sender().address!, jetton_master_address: JettonMinter.address },
            JettonWalletCode
        )
    );

    let master_msg = beginCell()
        .storeUint(395134233, 32) // opCode: TokenTransferInternal / 0x178d4519
        .storeUint(0, 64) // query_id
        .storeCoins(toNano('1000000')) // jetton_amount
        .storeAddress(JettonMinter.address) // from_address
        .storeAddress(provider.sender().address!) // response_address
        .storeCoins(0) // forward_ton_amount
        .storeUint(0, 1) // whether forward_payload or not
        .endCell();

    await JettonMinter.sendMint(provider.sender(), { // 0x642b7d07
        value: toNano('1.5'),
        queryID: 10,
        toAddress: provider.sender().address!,
        tonAmount: toNano('0.4'),
        master_msg: master_msg
    });

    while (!await provider.isContractDeployed(JettonWalletDeployer.address)) {
        console.log('wait for deploy')
        await sleep(2000)
    }
}
