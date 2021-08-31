import H264Remuxer from './h264-remuxer';
import MP4 from './mp4-generator';
import * as debug from './util/debug';
import VideoStreamBuffer from './util/nalu-stream-buffer';

export const mimeType = 'video/mp4; codecs="avc1.42E01E"';
export { setLogger } from './util/debug';

export default class VideoConverter {

    private mediaSource!: MediaSource;
    private receiveBuffer: VideoStreamBuffer = new VideoStreamBuffer();
    private remuxer!: H264Remuxer;

    private mediaReady!: boolean;
    private mediaReadyPromise: Promise<void> | undefined;
    private queue: Uint8Array[] = [];

    public sourceBuffer!: SourceBuffer;

    static get errorNotes() {
        return {
            [MediaError.MEDIA_ERR_ABORTED]: 'fetching process aborted by user',
            [MediaError.MEDIA_ERR_NETWORK]: 'error occurred when downloading',
            [MediaError.MEDIA_ERR_DECODE]: 'error occurred when decoding',
            [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: 'audio/video not supported',
        };
    }

    constructor(private element: HTMLVideoElement, private fps: number = 60, private fpf = fps) {
        if (!MediaSource || !MediaSource.isTypeSupported(mimeType)) {
            throw new Error(`Your browser is not supported: ${mimeType}`);
        }
        this.reset();
    }

    private setup(): Promise<void> {
        this.mediaReadyPromise = new Promise<void>((resolve, _reject) => {
            this.mediaSource.addEventListener('sourceopen', () => {
                debug.log(`Media Source opened.`);
                this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
                // this.sourceBuffer.mode = 'sequence';
                this.sourceBuffer.addEventListener('updateend', () => {
                    debug.log(`  SourceBuffer updateend`);
                    debug.log(`    sourceBuffer.buffered.length=${this.sourceBuffer.buffered.length}`);
                    for (let i = 0, len = this.sourceBuffer.buffered.length; i < len; i++) {
                        debug.log(`    sourceBuffer.buffered [${i}]: ` +
                                    `${this.sourceBuffer.buffered.start(i)}, ${this.sourceBuffer.buffered.end(i)}`);
                    }
                    debug.log(`  mediasource.duration=${this.mediaSource.duration}`);
                    debug.log(`  mediasource.readyState=${this.mediaSource.readyState}`);
                    debug.log(`  video.duration=${this.element.duration}`);
                    debug.log(`    video.buffered.length=${this.element.buffered.length}`);
                    if (debug.isEnable()) {
                        for (let i = 0, len = this.element.buffered.length; i < len; i++) {
                            debug.log(`    video.buffered [${i}]: ${this.element.buffered.start(i)}, ${this.element.buffered.end(i)}`);
                        }
                    }
                    debug.log(`  video.currentTime=${this.element.currentTime}`);
                    debug.log(`  video.readyState=${this.element.readyState}`);
                    if (this.sourceBuffer.updating) {
                        return;
                    }
                    const data = this.queue.shift();
                    if (data) {
                        this.doAppend(data);
                    }
                });
                this.sourceBuffer.addEventListener('error', () => {
                    debug.error('  SourceBuffer errored!');
                });
                this.mediaReady = true;
                resolve();
            }, false);
            this.mediaSource.addEventListener('sourceclose', () => {
                debug.log(`Media Source closed.`);
                this.mediaReady = false;
            }, false);

            this.element.src = URL.createObjectURL(this.mediaSource);
        });
        return this.mediaReadyPromise;
    }

    public play(): void {
        if (!this.element.paused) {
            return;
        }
        if (this.mediaReady && this.element.readyState >= 2) {
            this.element.play();
        } else {
            const handler = () => {
                this.play();
                this.element.removeEventListener('canplaythrough', handler);
            };
            this.element.addEventListener('canplaythrough', handler);
        }
    }

    public pause(): void {
        if (this.element.paused) {
            return;
        }
        this.element.pause();
    }

    public reset(): void {
        this.receiveBuffer.clear();
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            if (this.sourceBuffer.updating) {
                const mediaSource = this.mediaSource;
                this.sourceBuffer.addEventListener('updateend', () => {
                    mediaSource.endOfStream();
                });
            }
        }
        this.mediaSource = new MediaSource();
        this.remuxer = new H264Remuxer(this.fps, this.fpf, this.fps * 60);
        this.mediaReady = false;
        this.mediaReadyPromise = undefined;
        this.queue = [];

        this.setup();
    }

    public appendRawData(data: ArrayLike<number>): void {
        const nalus = this.receiveBuffer.append(data);
        for (const nalu of nalus) {
            const ret = this.remuxer.remux(nalu);
            if (ret) {
                this.writeFragment(ret[0], ret[1]);
            }
        }
    }

    private writeFragment(dts: number, pay: Uint8Array): void {
        const remuxer = this.remuxer;
        if (remuxer.mp4track.isKeyFrame) {
            this.writeBuffer(MP4.initSegment([remuxer.mp4track], Infinity, remuxer.timescale));
        }
        if (pay && pay.byteLength) {
            debug.log(` Put fragment: ${remuxer.seqNum}, frames=${remuxer.mp4track.samples.length}, size=${pay.byteLength}`);
            const fragment = MP4.fragmentSegment(remuxer.seqNum, dts, remuxer.mp4track, pay);
            this.writeBuffer(fragment);
            remuxer.flush();
        } else {
            debug.error(`Nothing payload!`);
        }
    }

    private writeBuffer(data: Uint8Array): void {
        if (this.mediaReady) {
            if (this.sourceBuffer.updating || this.queue.length) {
                this.queue.push(data);
            } else {
                this.doAppend(data);
            }
        } else {
            this.queue.push(data);
            if (this.mediaReadyPromise) {
                this.mediaReadyPromise.then(() => {
                    if (!this.sourceBuffer.updating) {
                        const d = this.queue.shift();
                        if (d) {
                            this.doAppend(d);
                        }
                    }
                });
                this.mediaReadyPromise = undefined;
            }
        }
    }

    private doAppend(data: Uint8Array): void {
        const error = this.element.error;
        if (error) {
            debug.error(`MSE Error Occured: ${VideoConverter.errorNotes[error.code]}`);
            this.element.pause();
            if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
            }
        } else {
            try {
                // this.downloadVideo(data);
                this.sourceBuffer.appendBuffer(data);
                debug.log(`  appended buffer: size=${data.byteLength}`);
            } catch (err) {
                // if (err.name === 'QuotaExceededError') {
                //     debug.log(`MSE: quota fail.`);
                //     this.queue.unshift(data);
                //     this.initCleanUp();
                //     return;
                // }
                debug.error(`MSE Error occured while appending buffer. ${err.name}: ${err.message}`);
            }
        }
    }

    // private fileCount = 1;
    // private downloadVideo(data: Uint8Array): void {
    //     if (this.fileCount > 20) {
    //         return;
    //     }
    //     const blob = new Blob([data], { type: 'application/octet-stream' });
    //     const url = URL.createObjectURL(blob);
    //     setTimeout(() => {
    //         URL.revokeObjectURL(url);
    //     }, 1000);

    //     const a = document.createElement('a');
    //     a.href = url;
    //     a.download = `sdl-video-${this.fileCount++}.blob`;
    //     document.body.appendChild(a);
    //     a.style.display = 'none';
    //     a.click();
    //     a.remove();
    // }
}
