import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/order/router_sell_ton.tact',
    options: {
        debug: true,
    },
};