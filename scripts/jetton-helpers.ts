import { Sha256 } from "@aws-crypto/sha256-js";
import {Dictionary, beginCell, Cell, Address, Builder, Slice} from "@ton/core";
import {client} from "./imports/consts"
import { parseDict } from '@ton/core/dist/dict/parseDict';

const ONCHAIN_CONTENT_PREFIX = 0x00;
const SNAKE_PREFIX = 0x00;
const CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8);

const sha256 = (str: string) => {
    const sha = new Sha256();
    sha.update(str);
    return Buffer.from(sha.digestSync());
};

const toKey = (key: string) => {
    return BigInt(`0x${sha256(key).toString("hex")}`);
};

export function buildOnchainMetadata(data: { name: string; description: string; image: string }): Cell {
    let dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());

    // Store the on-chain metadata in the dictionary
    Object.entries(data).forEach(([key, value]) => {
        dict.set(toKey(key), makeSnakeCell(Buffer.from(value, "utf8")));
    });

    return beginCell().storeInt(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}

export function makeSnakeCell(data: Buffer) {
    // Create a cell that package the data
    let chunks = bufferToChunks(data, CELL_MAX_SIZE_BYTES);

    const b = chunks.reduceRight((curCell, chunk, index) => {
        if (index === 0) {
            curCell.storeInt(SNAKE_PREFIX, 8);
        }
        curCell.storeBuffer(chunk);
        if (index > 0) {
            const cell = curCell.endCell();
            return beginCell().storeRef(cell);
        } else {
            return curCell;
        }
    }, beginCell());
    return b.endCell();
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
    let chunks: Buffer[] = [];
    while (buff.byteLength > 0) {
        chunks.push(buff.slice(0, chunkSize));
        buff = buff.slice(chunkSize);
    }
    return chunks;
}

export type JettonTransfer = {
    $$type: 'JettonTransfer';
    query_id: bigint;
    amount: bigint;
    destination: Address;
    response_destination: Address;
    custom_payload: Cell | null;
    forward_ton_amount: bigint;
    forward_payload: Slice;
}

export function storeJettonTransfer(src: JettonTransfer) {
    return (builder: Builder) => {
        let b_0 = builder;
        b_0.storeUint(260734629, 32);
        b_0.storeUint(src.query_id, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.destination);
        b_0.storeAddress(src.response_destination);
        if (src.custom_payload !== null && src.custom_payload !== undefined) { b_0.storeBit(true).storeRef(src.custom_payload); } else { b_0.storeBit(false); }
        b_0.storeCoins(src.forward_ton_amount);
        b_0.storeUint(0, 1);
        b_0.storeBuilder(src.forward_payload.asBuilder());
    };
}

export async function getJettonWallet(jettonMaster: Address, owner: Address) {
    const {gas_used, stack} = await client.runMethod(jettonMaster, 'get_wallet_address', [
        {
            type: 'slice',
            cell: beginCell().storeAddress(owner).endCell()
        }
    ])

    return stack.readAddressOpt()!!
}

export type JettonData = {
    $$type: 'JettonData';
    total_supply: bigint;
    mintable: boolean;
    admin_address: Address;
    jetton_content: Cell;
    jetton_wallet_code: Cell;
}

export function loadJettonData(slice: Slice) {
    let sc_0 = slice;
    let _total_supply = sc_0.loadCoins();
    let _mintable = sc_0.loadBit();
    let _admin_address = sc_0.loadAddress();
    let _jetton_content = sc_0.loadRef();
    let _jetton_wallet_code = sc_0.loadRef();
    return { $$type: 'JettonData' as const, total_supply: _total_supply, mintable: _mintable, admin_address: _admin_address, jetton_content: _jetton_content, jetton_wallet_code: _jetton_wallet_code };
}

export async function getJettonDecimals(jettonMaster: Address) {
    const {gas_used, stack} = await client.runMethod(jettonMaster, 'get_jetton_data')
    const total_supply = stack.readNumber()
    const mintable = stack.readBoolean()
    const admin_address = stack.readAddress()
    const jetton_content = stack.readCell()
    const jetton_wallet_code = stack.readCell()

    const getKeys = async () => {
        const metadataKeys = new Map<bigint, string>()
        const metadata = ['name', 'description', 'symbol', 'image_data', 'decimals'];

        for (let i of metadata) {
            const sha256View = await sha256(i)
            let b = 0n, c = 1n << 248n
            for (let byte of sha256View) {
                b += BigInt(byte) * c
                c /= 256n
            }
            metadataKeys.set(b, i)
        }

        return metadataKeys;
    }

    const hasMap = parseDict(jetton_content.refs[0].beginParse(), 256, (src) => src)
    const deserializeHashMap = new Map<string, string>()
    const metadataKeys = await getKeys()

    for (let [intKey, stringKey] of metadataKeys) {
        const value = hasMap.get(intKey)!.loadStringTail().split('\x00')[1]
        deserializeHashMap.set(stringKey, value)
    }

    const jettonContent = {
        name: deserializeHashMap.get('name'),
        description: deserializeHashMap.get('description'),
        symbol: deserializeHashMap.get('symbol'),
        image_data: deserializeHashMap.get('image_data'),
        decimals: deserializeHashMap.get('decimals')
    }

    return Number(jettonContent.decimals!)
}