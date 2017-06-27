import H264Parser from './h264-parser';
import { Track } from './types';
import NALU from './util/NALU';

// tslint:disable:no-bitwise

let trackId = 1;

export default class H264Remuxer {
    public readyToDecode: boolean;

    private totalDTS: number;
    private stepDTS: number;
    private frameCount: number;

    private seq: number;
    public mp4track: Track;
    private unitSamples: NALU[][];

    private parser: H264Parser;

    private static getTrackID() {
        return trackId++;
    }

    constructor(public fps: number, public framePerFragment: number, public timescale: number) {
        this.readyToDecode = false;

        this.totalDTS = 0;
        this.stepDTS = Math.round(this.timescale / this.fps);
        this.frameCount = 0;

        this.seq = 1;
        this.mp4track = {
            id: H264Remuxer.getTrackID(),
            type: 'video',
            len: 0,
            codec: '',
            sps: [],
            pps: [],
            seiBuffering: false,
            width: 0,
            height: 0,
            timescale,
            duration: timescale,
            samples: [],
            isKeyFrame: true,
        };
        this.unitSamples = [[]];

        this.parser = new H264Parser(this);
    }

    public get seqNum(): number {
        return this.seq;
    }

    public remux(nalu: NALU): [number, Uint8Array] | undefined {
        if (this.mp4track.seiBuffering && nalu.type() === NALU.SEI) {
            return this.createNextFrame();
        }
        if (this.parser.parseNAL(nalu)) {
            this.unitSamples[this.unitSamples.length - 1].push(nalu);
            this.mp4track.len += nalu.getSize();
        }
        if (!this.mp4track.seiBuffering && (nalu.type() === NALU.IDR || nalu.type() === NALU.NDR)) {
            return this.createNextFrame();
        }
        return;
    }

    private createNextFrame(): [number, Uint8Array] | undefined {
        if (this.mp4track.len > 0) {
            this.frameCount++;
            if (this.frameCount % this.framePerFragment === 0) {
                const fragment = this.getFragment();
                if (fragment) {
                    const dts = this.totalDTS;
                    this.totalDTS = this.stepDTS * this.frameCount;
                    return [dts, fragment];
                }
            }
            this.unitSamples.push([]);
        }
        return;
    }

    public flush(): void {
        this.seq++;
        this.mp4track.len = 0;
        this.mp4track.samples = [];
        this.mp4track.isKeyFrame = false;
        this.unitSamples = [[]];
    }

    private getFragment(): Uint8Array | undefined {
        if (!this.checkReadyToDecode()) {
            return undefined;
        }

        const payload = new Uint8Array(this.mp4track.len);
        this.mp4track.samples = [];
        let offset = 0;
        for (let i = 0, len = this.unitSamples.length; i < len; i++) {
            const units = this.unitSamples[i];
            if (units.length === 0) {
                continue;
            }
            const mp4Sample = {
                size: 0,
                cts: this.stepDTS * i,
            };
            for (const unit of units) {
                mp4Sample.size += unit.getSize();
                payload.set(unit.getData(), offset);
                offset += unit.getSize();
            }
            this.mp4track.samples.push(mp4Sample);
        }

        if (offset === 0) {
            console.log(`No mp4 sample data.`);
            return undefined;
        }
        return payload;
    }

    private checkReadyToDecode(): boolean {
        if (!this.readyToDecode || this.unitSamples.filter((array) => array.length > 0).length === 0) {
            console.log(`Not ready to decode! readyToDecode(${this.readyToDecode}) is false or units is empty.`);
            return false;
        }
        return true;
    }
}
