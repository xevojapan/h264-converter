// tslint:disable:no-bitwise

export default class BitStream {

    private index = 0;
    private bitLength: number;

    constructor(private data: Uint8Array) {
        this.bitLength = data.byteLength * 8;
    }

    get bitsAvailable(): number {
        return this.bitLength - this.index;
    }

    public skipBits(size: number): void {
        // console.log(`  skip bits: size=${size}, ${this.index}.`);
        if (this.bitsAvailable < size) {
            throw new Error('no bytes available');
        }
        this.index += size;
    }

    public readBits(size: number): number {
        // console.log(`  read bits: size=${size}, ${this.index}.`);
        const result = this.getBits(size, this.index);
        // console.log(`    read bits: result=${result}`);
        return result;
    }

    private getBits(size: number, offsetBits: number, moveIndex: boolean = true): number {
        if (this.bitsAvailable < size) {
            throw new Error('no bytes available');
        }
        const offset = offsetBits % 8;
        const byte = this.data[(offsetBits / 8) | 0] & (0xff >>> offset);
        const bits = 8 - offset;
        if (bits >= size) {
            if (moveIndex) {
                this.index += size;
            }
            return byte >> (bits - size);
        } else {
            if (moveIndex) {
                this.index += bits;
            }
            const nextSize = size - bits;
            return (byte << nextSize) | this.getBits(nextSize, offsetBits + bits, moveIndex);
        }
    }

    public skipLZ(): number {
        let leadingZeroCount: number;
        for (leadingZeroCount = 0; leadingZeroCount < this.bitLength - this.index; ++leadingZeroCount) {
            if (0 !== this.getBits(1, this.index + leadingZeroCount, false)) {
                // console.log(`  skip LZ  : size=${leadingZeroCount}, ${this.index}.`);
                this.index += leadingZeroCount;
                return leadingZeroCount;
            }
        }
        return leadingZeroCount;
    }

    public skipUEG(): void {
        this.skipBits(1 + this.skipLZ());
    }

    public skipEG(): void {
        this.skipBits(1 + this.skipLZ());
    }

    public readUEG(): number {
        const prefix = this.skipLZ();
        return this.readBits(prefix + 1) - 1;
    }

    public readEG(): number {
        const value = this.readUEG();
        if (0x01 & value) {
            // the number is odd if the low order bit is set
            return (1 + value) >>> 1; // add 1 to make it even, and divide by 2
        } else {
            return -1 * (value >>> 1); // divide by two then make it negative
        }
    }

    public readBoolean(): boolean {
        return 1 === this.readBits(1);
    }
    public readUByte(): number {
        return this.readBits(8);
    }
    public readUShort(): number {
        return this.readBits(16);
    }
    public readUInt(): number {
        return this.readBits(32);
    }
}
