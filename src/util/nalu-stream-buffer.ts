import NALU from './NALU';

export default class VideoStreamBuffer {
    private buffer: Uint8Array | undefined;

    public clear(): void {
        this.buffer = undefined;
    }

    public append(value: ArrayLike<number>): NALU[] {
        const nextNalHeader = (b: Uint8Array) => {
            let i = 3;
            return (): number | undefined => {
                let count = 0;
                for (; i < b.length; i++) {
                    switch (b[i]) {
                        case 0:
                            count++;
                            break;
                        case 1:
                            if (count === 3) {
                                return i - 3;
                            }
                        // tslint:disable-next-line:no-switch-case-fall-through
                        default:
                            count = 0;
                    }
                }
                return;
            };
        };

        const result: NALU[] = [];
        let buffer: Uint8Array | undefined;
        if (this.buffer) {
            if (value[3] === 1 && value[2] === 0 && value[1] === 0 && value[0] === 0) {
                result.push(new NALU(this.buffer.subarray(4)));
                buffer = Uint8Array.from(value);
            }
        }
        if (buffer == null) {
            buffer = this.mergeBuffer(value);
        }

        let lastIndex = 0;
        const f = nextNalHeader(buffer);
        for (let index = f(); index != null; index = f()) {
            result.push(new NALU(buffer.subarray(lastIndex + 4, index)));
            lastIndex = index;
        }
        this.buffer = buffer.subarray(lastIndex);
        return result;
    }

    private mergeBuffer(value: ArrayLike<number>): Uint8Array {
        if (this.buffer == null) {
            return Uint8Array.from(value);
        } else {
            const newBuffer = new Uint8Array(this.buffer.byteLength + value.length);
            if (this.buffer.byteLength > 0) {
                newBuffer.set(this.buffer, 0);
            }
            newBuffer.set(value, this.buffer.byteLength);
            return newBuffer;
        }
    }
}
