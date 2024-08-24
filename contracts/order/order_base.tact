import "./JettonMessages";
import "./errcodes";

struct State {
    request: Request;
    open: Bool;
}

const jetton_transfer_fee: Int = ton("0.04"); // ~ 0.04 TON, medium fee for any amount of Jetton is 0.037 TON - docs

trait OrderBase {
    router: Address;

    request: Request;

    open: Bool;

    fun withdraw() {
        send(SendParameters{
            to: self.request.seller,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
        });
    }

    get fun state(): State {
        return State {
            request: self.request,
            open: self.open,
        };
    }
}
