# Architecton-p2p
p2p exchange on TON, carried out by means of a contract order.tact, order_sell_ton.tact and order_buy_ton.tact

# Tests

`npx blueprint test` or `yarn blueprint test`

1. Order.spec.ts - tests for two stages of life cycle of Order with all alternative flows
2. OrderSellTon.spec.ts - tests for life cycle of OrderSellTon with all alternative flows
3. OrderBuyTon.spec.ts - tests for two stages of life cycle of OrderBuyTon with all alternative flows


# Scripts

`npx blueprint run` or `yarn blueprint run`

1. deployOrder.ts - deployment script, where you must specify only jetton masters
2. deployOrderSellTon.ts - deployment script, where you must specify only jetton master
3. deployOrderBuyTon.ts - deployment script, where you must specify only jetton master
4. sendJetton.ts - simple script for jetton transfer to order with automatic calculating of decimals
5. transferTon.ts - simple script got ton transfer
6. jetton-helpers.ts - micro library for blockchain processing with jettons

# Contracts & wrappers
Order, jetton-wallet and jetton-minter contracts accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74)
and wrapper files to work with them.


# Order
Order is contract for exchange tokens in the TON network

The main difference from original p2p exchanges is that you don't need a guarantor in the form of an exchange,
the smart contract itself acts as a guarantor, so you can make the exchange as you wish without bring scammed.

## Exchange description
So, in order to make an exchange, you must specify the following request characteristics:
- order_jetton_sell_wallet: order jetton wallet of the jetton being sold
- order_jetton_buy_waller: order jetton wallet of the jetton used for payment
- jetton_sell_master: master wallet of the jetton being sold
- jetton_buy_master: master wallet of the jetton used for payment
- amount_sell: the amount of jettons sold in nanotokens
- amount_buy: the amount of jetton used for payment in nanotokens

- timeout: timestamp after which the order can only be cancelled


## Interface
### External messages
1. Send request - owner-formed message, containing information about order
2. Send owner-formed cansel-message for cancelling order and refund jetton for sale

### Internal messages
1. Jetton Transfer & Jetton Transfer Notification - messages in accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74).

### Getters
1. state - struct, describing current state of order: 
- seller
- Request
- open (true/false)


# Order sell ton
Order is contract for exchange ton to jettons in the TON network

The main difference from original p2p exchanges is that you don't need a guarantor in the form of an exchange,
the smart contract itself acts as a guarantor, so you can make the exchange as you wish without bring scammed.

## Exchange description
So, in order to make an exchange, you must specify the following request characteristics:
- order_jetton_buy_waller: order jetton wallet of the jetton used for payment
- jetton_buy_master: master wallet of the jetton used for payment
- amount_sell: the amount of jettons sold in nanotons
- amount_buy: the amount of jetton used for payment in nanotokens

- timeout: timestamp after which the order can only be cancelled


## Interface
### External messages
1. Send request - owner-formed message, containing information about order
2. Send owner-formed cansel-message for cancelling order and refund jetton for sale

### Internal messages
1. Jetton Transfer & Jetton Transfer Notification - messages in accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74).

### Getters
1. state - struct, describing current state of order:
- seller
- Request
- open (true/false)


# Order buy ton
Order is contract for exchange tokens in the TON network

The main difference from original p2p exchanges is that you don't need a guarantor in the form of an exchange,
the smart contract itself acts as a guarantor, so you can make the exchange as you wish without bring scammed.

That way wallet can be extended in numerous ways, including partial, infinite or programmatic allowances, special connectors to specific DApps, custom user-governed add-ons.

## Exchange description
So, in order to make an exchange, you must specify the following request characteristics:
- order_jetton_sell_wallet: order jetton wallet of the jetton being sold
- order_jetton_buy_waller: order jetton wallet of the jetton used for payment
- jetton_sell_master: master wallet of the jetton being sold
- jetton_buy_master: master wallet of the jetton used for payment
- amount_sell: the amount of jettons sold in nanotokens
- amount_buy: the amount of jetton used for payment in nanotokens

- timeout: timestamp after which the order can only be cancelled


## Interface
### External messages
1. Send request - owner-formed message, containing information about order
2. Send "transfer ton" - message for buyer payment for seller jettons
3. Send owner-formed cansel-message for cancelling order and refund jetton for sale

### Internal messages
1. Jetton Transfer & Jetton Transfer Notification - messages in accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74).

### Getters
1. state - struct, describing current state of order:
- seller
- Request
- open (true/false)


