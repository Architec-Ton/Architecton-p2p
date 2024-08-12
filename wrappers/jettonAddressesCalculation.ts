import { Address, beginCell } from '@ton/core';
import { TonClient } from '@ton/ton';

export async function calculateUSDTWallet(jettonMaster: Address, owner: Address) {
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC', // на мейне использовать наш "https://ton.architecton.site/api/v2/"
        apiKey: '53933111b4d39dcfdfa30ef6593b89c83f7c1c5b1d1e0faf055b9e3f510824ae' // когда наш - апи ключ не нужен
    });


    const {gas_used, stack} = await client.runMethod(jettonMaster, 'get_wallet_address', [
        {
            type: 'slice',
            cell: beginCell().storeAddress(owner).endCell()
        }
    ])

   return stack.readAddressOpt()!!
}