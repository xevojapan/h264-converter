import { BitStream } from './bit-stream';

test('readBits return valid value', () => {
    const stream = new BitStream(Uint8Array.from([0xaa]));
    expect(stream.bitsAvailable).toBe(8);
    expect(stream.readBits(1)).toBe(1);
    expect(stream.readBits(3)).toBe(2);
    expect(stream.bitsAvailable).toBe(4);
    expect(stream.readBits(3)).toBe(5);
    expect(stream.bitsAvailable).toBe(1);
    stream.skipBits(1);
    expect(stream.bitsAvailable).toBe(0);
});
