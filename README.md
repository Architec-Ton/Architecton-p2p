# Architecton-p2p
p2p exchange on TON, carried out by means of a contract order.tact

# Tests

`npx blueprint test` or `yarn blueprint test`

1. Order.spec.ts - tests for two stages of life cycle of Order with all alternative flows


# Scripts

`npx blueprint run` or `yarn blueprint run`

1. deployOrder.ts - deployment script, where you must specify only jetton masters
2. sendJetton.ts - simple script for jetton transfer to order with automatic calculating of decimals
3. jetton-helpers.ts - micro library for blockchain processing with jettons

# Contracts & wrappers
Order, jetton-wallet and jetton-minter contracts accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74)
and wrapper files to work with them.


# Order
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
2. Send owner-formed cansel-message for cancelling order and refund jetton for sale

### Internal messages
1. Jetton Transfer & Jetton Transfer Notification - messages in accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74).

### Getters
1. state - struct, describing current state of order: 
- seller
- Request
- open (true/false)

