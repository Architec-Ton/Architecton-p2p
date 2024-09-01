import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/order/router_sell_nft.tact',
    options: {
        debug: true,
    },
};
