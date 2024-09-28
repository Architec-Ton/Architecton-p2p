import { TonClient } from '@ton/ton';

export const masters = new Map<string, string>([
    ['USDT', 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'],
    ['NOT', 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT'],
    ['BNK', 'kQBuFWV6jW_9F69A3qjn5rpqfG4eIMBJs9GFSrZU7d33EmIG'],
    ['ARC', 'kQDJ4yZlYHbwbUtFAtyk7YOMt7cWUY-Hk0TB9-pg2ZOxHMMf'],
    ['testUSDT', 'kQApoN_JyPCYZhiw7Tm0cr7FPmOFTfpRykG5EeIitQRpvMIo']
])

export const client = new TonClient({
    endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    apiKey: '53933111b4d39dcfdfa30ef6593b89c83f7c1c5b1d1e0faf055b9e3f510824ae'
});

