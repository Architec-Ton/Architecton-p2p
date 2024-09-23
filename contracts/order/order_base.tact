import "./JettonMessages";
import "./errcodes";

message(0x71a9dc7a) Cancel {}

struct State {
    type: Int as uint8;
    seller: Address;
    request: Request;
    open: Bool;
}

trait OrderBase {
    seller: Address;
    router: Address;
    type: Int;

    request: Request;

    open: Bool;

    fun withdraw() {
        send(SendParameters{
            to: self.seller,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
        });
    }

    fun SmartThrow(code: Int, condition: Bool, to: Address, amount: Int): Bool {
        if (!condition) {
            if (context().value >= jetton_transfer_fee) {
                basicJettonTransfer(context().sender, to, amount, 0, SendIgnoreErrors);
            } else {
                dump(context().value);
                nativeThrow(not_enough_ton);
            }
            emit(beginCell().storeUint(code, 32).endCell());
        }

        return condition;
    }

    get fun state(): State {
        return State {
            type: self.type,
            seller: self.seller,
            request: self.request,
            open: self.open,
        };
    }
}
