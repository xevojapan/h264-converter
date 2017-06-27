export interface Track {
    id: number;
    type: 'video' | 'audio';
    len: number;
    codec: string;
    sps: Uint8Array[];
    pps: Uint8Array[];
    seiBuffering: boolean;
    width: number;
    height: number;
    timescale: number;
    duration: number;

    samples: TrackSample[];
    isKeyFrame: boolean;
}

export interface TrackSample {
    size: number;
}
