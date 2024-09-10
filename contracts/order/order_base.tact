import "./JettonMessages";
import "./errcodes";

message(0x71a9dc7a) Cancel {}

struct State {
    seller: Address;
    request: Request;
    open: Bool;
}

trait OrderBase {
    seller: Address;
    router: Address;

    request: Request;

    open: Bool;

    fun withdraw() {
        send(SendParameters{
            to: self.seller,
            value: 0,
            mode: SendRemainingBalance + SendDestroyIfZero,
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
