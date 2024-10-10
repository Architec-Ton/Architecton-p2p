import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/order/order_buy_ton.tact',
    options: {
        debug: true,
    },
};
