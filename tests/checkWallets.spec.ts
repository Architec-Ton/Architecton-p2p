import {Blockchain} from '@ton/sandbox';
import {Address, Cell, toNano} from '@ton/core';
import '@ton/test-utils';
import {Wallet} from "../wrappers/jetton-wallet";
import {Minter} from "../wrappers/jetton-minter";
import { Order, Request } from '../build/Order/tact_Order';

describe('checkWallets', () => {
    let blockchain: Blockchain;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
    }, 100000000);

    it('check usdt', async () => {
        const usdtWalletCode = Cell.fromBoc(Buffer.from('b5ee9c72010101010023000842028f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68', "hex"))[0]

        const usdtAdmin = Address.parse('0:6440fe3c69410383963945173c4b11479bf0b9b4d7090e58777bda581c2f9998')
        const usdtMinter = blockchain.openContract(
            Minter.createFromAddress(
                Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
            )
        );

        const jettonWalletAdmin = blockchain.openContract(
            Wallet.createFromConfig(
                { owner_address: usdtAdmin, jetton_master_address: usdtMinter.address },
                usdtWalletCode
            )
        );

        expect(jettonWalletAdmin.address.toString()).toEqual('EQDs79iIlXqImS9WmbsZJ08p0grbU55J8xkB2R4n2kNgX3XQ')
    }, 100000000);
});
