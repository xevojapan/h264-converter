// tslint:disable:no-bitwise

export default class NALU {
    public nri: number;
    public ntype: number;

    static get NDR() { return 1; }
    static get IDR() { return 5; }
    static get SEI() { return 6; }
    static get SPS() { return 7; }
    static get PPS() { return 8; }

    static get TYPES() {
        return {
            [NALU.IDR]: 'IDR',
            [NALU.SEI]: 'SEI',
            [NALU.SPS]: 'SPS',
            [NALU.PPS]: 'PPS',
            [NALU.NDR]: 'NDR',
        };
    }

    public static type(nalu: NALU) {
        if (nalu.ntype in NALU.TYPES) {
            return NALU.TYPES[nalu.ntype];
        } else {
            return 'UNKNOWN';
        }
    }

    constructor(public data: Uint8Array) {
        this.nri = (data[0] & 0x60) >> 5;
        this.ntype = data[0] & 0x1f;
        // console.log(` NALU: type=${this.ntype}, size=${this.data.byteLength}`);
    }

    public type(): number {
        return this.ntype;
    }

    public isKeyframe(): boolean {
        return this.ntype === NALU.IDR;
    }

    public getSize(): number {
        return 4 + this.data.byteLength;
    }

    public getData(): Uint8Array {
        const result = new Uint8Array(this.getSize());
        const view = new DataView(result.buffer);
        view.setUint32(0, this.getSize() - 4);

        result.set(this.data, 4);
        return result;
    }
}
