import "./JettonMessages";
import "./errcodes";

message InitData {
    seller: Address;
    time: Int as uint64;
}

struct State {
    seller: Address;
    request: Request;
    open: Bool;
}

const jetton_transfer_fee: Int = ton("0.04"); // ~ 0.04 TON, medium fee for any amount of Jetton is 0.037 TON - docs

trait OrderBase {
    seller: Address;
    router: Address;

    request: Request;

    open: Bool;

    fun withdraw() {
        self.open = false;

        send(SendParameters{
            to: self.seller,
            value: 0,
            bounce: false,
            mode: SendRemainingBalance + SendDestroyIfZero,
            body: null,
        });
    }

    get fun state(): State {
        return State {
            seller: self.seller,
            request: self.request,
            open: self.open,
        };
    }
}
