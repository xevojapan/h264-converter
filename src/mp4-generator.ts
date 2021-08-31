import { Track } from './types';

// tslint:disable:no-bitwise
// tslint:disable:align

/**
 * Generate MP4 Box
 * got from: https://github.com/dailymotion/hls.js
 */
export default class MP4 {
    private static types: { [type: string]: number[]; } = {};
    private static initalized = false;

    private static FTYP: Uint8Array;
    private static HDLR: Uint8Array;
    private static DINF: Uint8Array;
    private static STSD: Uint8Array;
    // @ts-ignore
    private static SMHD: Uint8Array;
    private static VMHD: Uint8Array;
    private static STSZ: Uint8Array;
    private static STTS: Uint8Array;
    private static STSC: Uint8Array;
    private static STCO: Uint8Array;
    private static STYP: Uint8Array;

    private static init(): void {
        MP4.initalized = true;
        MP4.types = {
            avc1: [], // codingname
            avcC: [],
            btrt: [],
            dinf: [],
            dref: [],
            esds: [],
            ftyp: [],
            hdlr: [],
            mdat: [],
            mdhd: [],
            mdia: [],
            mfhd: [],
            minf: [],
            moof: [],
            moov: [],
            mp4a: [],
            mvex: [],
            mvhd: [],
            sdtp: [],
            stbl: [],
            stco: [],
            stsc: [],
            stsd: [],
            stsz: [],
            stts: [],
            styp: [],
            tfdt: [],
            tfhd: [],
            traf: [],
            trak: [],
            trun: [],
            trep: [],
            trex: [],
            tkhd: [],
            vmhd: [],
            smhd: [],
        };
        for (const type in MP4.types) {
            if (MP4.types.hasOwnProperty(type)) {
                MP4.types[type] = [
                    type.charCodeAt(0),
                    type.charCodeAt(1),
                    type.charCodeAt(2),
                    type.charCodeAt(3),
                ];
            }
        }

        const hdlr = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00, // pre_defined
            0x76, 0x69, 0x64, 0x65, // handler_type: 'vide'
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x56, 0x69, 0x64, 0x65,
            0x6f, 0x48, 0x61, 0x6e,
            0x64, 0x6c, 0x65, 0x72, 0x00, // name: 'VideoHandler'
        ]);

        const dref = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01, // entry_count
            0x00, 0x00, 0x00, 0x0c, // entry_size
            0x75, 0x72, 0x6c, 0x20, // 'url' type
            0x00, // version 0
            0x00, 0x00, 0x01, // entry_flags
        ]);

        const stco = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00, // entry_count
        ]);

        MP4.STTS = MP4.STSC = MP4.STCO = stco;

        MP4.STSZ = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00, // sample_size
            0x00, 0x00, 0x00, 0x00, // sample_count
        ]);
        MP4.VMHD = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x01, // flags
            0x00, 0x00, // graphicsmode
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00, // opcolor
        ]);
        MP4.SMHD = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, // balance
            0x00, 0x00, // reserved
        ]);

        MP4.STSD = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01]); // entry_count

        MP4.FTYP = MP4.box(MP4.types.ftyp, new Uint8Array([
            0x69, 0x73, 0x6f, 0x35, // major brand = iso5
            0x00, 0x00, 0x00, 0x01, // minor version
            0x61, 0x76, 0x63, 0x31, // brand = avc1
            0x69, 0x73, 0x6f, 0x35, // brand = iso5
            0x64, 0x61, 0x73, 0x68, // brand = dash
        ]));
        MP4.STYP = MP4.box(MP4.types.styp, new Uint8Array([
            0x6d, 0x73, 0x64, 0x68, // major brand = msdh
            0x00, 0x00, 0x00, 0x00, // minor version
            0x6d, 0x73, 0x64, 0x68, // brand = msdh
            0x6d, 0x73, 0x69, 0x78, // brand = msix
        ]));
        MP4.DINF = MP4.box(MP4.types.dinf, MP4.box(MP4.types.dref, dref));
        MP4.HDLR = MP4.box(MP4.types.hdlr, hdlr);
    }

    public static box(type: number[], ...payload: Uint8Array[]): Uint8Array {
        let size = 8;
        // calculate the total size we need to allocate
        for (const p of payload) {
            size += p.byteLength;
        }
        const result = new Uint8Array(size);
        result[0] = (size >> 24) & 0xff;
        result[1] = (size >> 16) & 0xff;
        result[2] = (size >> 8) & 0xff;
        result[3] = size & 0xff;
        result.set(type, 4);
        // copy the payload into the result
        size = 8;
        for (const box of payload) {
            // copy box array @ offset size
            result.set(box, size);
            size += box.byteLength;
        }
        return result;
    }

    public static mdat(data: Uint8Array): Uint8Array {
        return MP4.box(MP4.types.mdat, data);
    }

    public static mdhd(timescale: number): Uint8Array {
        return MP4.box(MP4.types.mdhd, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01, // creation_time
            0x00, 0x00, 0x00, 0x02, // modification_time
            (timescale >> 24) & 0xFF,
            (timescale >> 16) & 0xFF,
            (timescale >> 8) & 0xFF,
            timescale & 0xFF, // timescale
            0x00, 0x00, 0x00, 0x00, // duration
            0x55, 0xc4, // 'und' language (undetermined)
            0x00, 0x00,
        ]));
    }

    public static mdia(track: Track): Uint8Array {
        return MP4.box(MP4.types.mdia, MP4.mdhd(track.timescale), MP4.HDLR, MP4.minf(track));
    }

    public static mfhd(sequenceNumber: number): Uint8Array {
        return MP4.box(MP4.types.mfhd, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00, // flags
            (sequenceNumber >> 24),
            (sequenceNumber >> 16) & 0xFF,
            (sequenceNumber >> 8) & 0xFF,
            sequenceNumber & 0xFF, // sequence_number
        ]));
    }

    public static minf(track: Track): Uint8Array {
        return MP4.box(MP4.types.minf, MP4.box(MP4.types.vmhd, MP4.VMHD), MP4.DINF, MP4.stbl(track));
    }

    public static moof(sn: number, baseMediaDecodeTime: number, track: Track): Uint8Array {
        return MP4.box(MP4.types.moof, MP4.mfhd(sn), MP4.traf(track, baseMediaDecodeTime));
    }

    /**
     * @param tracks... (optional) {array} the tracks associated with this movie
     */
    public static moov(tracks: Track[], duration: number, timescale: number): Uint8Array {
        const boxes: Uint8Array[] = [];
        for (const track of tracks) {
            boxes.push(MP4.trak(track));
        }
        return MP4.box(MP4.types.moov, MP4.mvhd(timescale, duration), MP4.mvex(tracks), ...boxes);
    }

    public static mvhd(timescale: number, duration: number): Uint8Array {
        const bytes = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01, // creation_time
            0x00, 0x00, 0x00, 0x02, // modification_time
            (timescale >> 24) & 0xFF,
            (timescale >> 16) & 0xFF,
            (timescale >> 8) & 0xFF,
            timescale & 0xFF, // timescale
            (duration >> 24) & 0xFF,
            (duration >> 16) & 0xFF,
            (duration >> 8) & 0xFF,
            duration & 0xFF, // duration
            0x00, 0x01, 0x00, 0x00, // 1.0 rate
            0x01, 0x00, // 1.0 volume
            0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, // pre_defined
            // 0xff, 0xff, 0xff, 0xff // next_track_ID
            0x00, 0x00, 0x00, 0x02, // next_track_ID
        ]);
        return MP4.box(MP4.types.mvhd, bytes);
    }

    public static mvex(tracks: Track[]): Uint8Array {
        const boxes: Uint8Array[] = [];
        for (const track of tracks) {
            boxes.push(MP4.trex(track));
        }
        return MP4.box(MP4.types.mvex, ...boxes, MP4.trep());
    }

    public static trep(): Uint8Array {
        return MP4.box(MP4.types.trep, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01, // track id
        ]));
    }

    // public static sdtp(track: Track): Uint8Array {
    //     const samples = track.samples || [];
    //     const bytes = new Uint8Array(4 + samples.length);
    //     // leave the full box header (4 bytes) all zero
    //     // write the sample table
    //     for (let i = 0; i < samples.length; i++) {
    //         const flags = samples[i].flags;
    //         bytes[i + 4] =
    //             (flags.dependsOn << 4) |
    //             (flags.isDependedOn << 2) |
    //             (flags.hasRedundancy);
    //     }
    //     return MP4.box(MP4.types.sdtp, bytes);
    // }

    public static stbl(track: Track): Uint8Array {
        return MP4.box(
            MP4.types.stbl,
            MP4.stsd(track),
            MP4.box(MP4.types.stts, MP4.STTS),
            MP4.box(MP4.types.stsc, MP4.STSC),
            MP4.box(MP4.types.stsz, MP4.STSZ),
            MP4.box(MP4.types.stco, MP4.STCO),
        );
    }

    public static avc1(track: Track): Uint8Array {
        let sps: number[] = [];
        let pps: number[] = [];

        // assemble the SPSs
        for (const data of track.sps) {
            const len = data.byteLength;
            sps.push((len >>> 8) & 0xFF);
            sps.push((len & 0xFF));
            sps = sps.concat(Array.prototype.slice.call(data)); // SPS
        }

        // assemble the PPSs
        for (const data of track.pps) {
            const len = data.byteLength;
            pps.push((len >>> 8) & 0xFF);
            pps.push((len & 0xFF));
            pps = pps.concat(Array.prototype.slice.call(data));
        }

        const avcc = MP4.box(MP4.types.avcC, new Uint8Array([
            0x01,   // version
            sps[3], // profile
            sps[4], // profile compat
            sps[5], // level
            0xfc | 3, // lengthSizeMinusOne, hard-coded to 4 bytes
            0xE0 | track.sps.length, // 3bit reserved (111) + numOfSequenceParameterSets
        ].concat(sps).concat([
            track.pps.length, // numOfPictureParameterSets
        ]).concat(pps))); // "PPS"
        const width = track.width;
        const height = track.height;

        return MP4.box(MP4.types.avc1, new Uint8Array([
            0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, // reserved
            0x00, 0x01, // data_reference_index
            0x00, 0x00, // pre_defined
            0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, // pre_defined
            (width >> 8) & 0xFF,
            width & 0xff, // width
            (height >> 8) & 0xFF,
            height & 0xff, // height
            0x00, 0x48, 0x00, 0x00, // horizresolution
            0x00, 0x48, 0x00, 0x00, // vertresolution
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x01, // frame_count
            0x12,
            0x62, 0x69, 0x6E, 0x65, // binelpro.ru
            0x6C, 0x70, 0x72, 0x6F,
            0x2E, 0x72, 0x75, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, // compressorname
            0x00, 0x18,   // depth = 24
            0x11, 0x11]), // pre_defined = -1
            avcc,
            MP4.box(MP4.types.btrt, new Uint8Array([
                0x00, 0x00, 0x00, 0x00, // bufferSizeDB
                0x00, 0x2d, 0xc6, 0xc0, // maxBitrate
                0x00, 0x2d, 0xc6, 0xc0, // avgBitrate
            ])),
        );
    }

    // public static esds(track: Track): Uint8Array {
    //     const configlen = track.config.byteLength;
    //     const data = new Uint8Array(26 + configlen + 3);
    //     data.set([
    //         0x00, // version 0
    //         0x00, 0x00, 0x00, // flags

    //         0x03, // descriptor_type
    //         0x17 + configlen, // length
    //         0x00, 0x01, //es_id
    //         0x00, // stream_priority

    //         0x04, // descriptor_type
    //         0x0f + configlen, // length
    //         0x40, //codec : mpeg4_audio
    //         0x15, // stream_type
    //         0x00, 0x00, 0x00, // buffer_size
    //         0x00, 0x00, 0x00, 0x00, // maxBitrate
    //         0x00, 0x00, 0x00, 0x00, // avgBitrate

    //         0x05, // descriptor_type
    //         configlen
    //     ]);
    //     data.set(track.config, 26);
    //     data.set([0x06, 0x01, 0x02], 26 + configlen);
    //     return data;
    // }

    // public static mp4a(track: Track): Uint8Array {
    //     const audiosamplerate = track.audiosamplerate;
    //     return MP4.box(MP4.types.mp4a, new Uint8Array([
    //         0x00, 0x00, 0x00, // reserved
    //         0x00, 0x00, 0x00, // reserved
    //         0x00, 0x01, // data_reference_index
    //         0x00, 0x00, 0x00, 0x00,
    //         0x00, 0x00, 0x00, 0x00, // reserved
    //         0x00, track.channelCount, // channelcount
    //         0x00, 0x10, // sampleSize:16bits
    //         0x00, 0x00, // pre_defined
    //         0x00, 0x00, // reserved2
    //         (audiosamplerate >> 8) & 0xFF,
    //         audiosamplerate & 0xff, //
    //         0x00, 0x00]),
    //         MP4.box(MP4.types.esds, MP4.esds(track))
    //     );
    // }

    public static stsd(track: Track): Uint8Array {
        return MP4.box(MP4.types.stsd, MP4.STSD, MP4.avc1(track));
    }

    public static tkhd(track: Track): Uint8Array {
        const id = track.id;
        const width = track.width;
        const height = track.height;
        return MP4.box(MP4.types.tkhd, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x01, // flags
            0x00, 0x00, 0x00, 0x01, // creation_time
            0x00, 0x00, 0x00, 0x02, // modification_time
            (id >> 24) & 0xFF,
            (id >> 16) & 0xFF,
            (id >> 8) & 0xFF,
            id & 0xFF, // track_ID
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // duration
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, // layer
            0x00, 0x00, // alternate_group
            (track.type === 'audio' ? 0x01 : 0x00), 0x00, // track volume
            0x00, 0x00, // reserved
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
            (width >> 8) & 0xFF,
            width & 0xFF,
            0x00, 0x00, // width
            (height >> 8) & 0xFF,
            height & 0xFF,
            0x00, 0x00, // height
        ]));
    }

    public static traf(track: Track, baseMediaDecodeTime: number): Uint8Array {
        // const sampleDependencyTable = MP4.sdtp(track);
        const id = track.id;
        return MP4.box(MP4.types.traf,
            MP4.box(MP4.types.tfhd, new Uint8Array([
                0x00, // version 0
                0x02, 0x00, 0x00, // flags
                (id >> 24),
                (id >> 16) & 0XFF,
                (id >> 8) & 0XFF,
                (id & 0xFF), // track_ID
            ])),
            MP4.box(MP4.types.tfdt, new Uint8Array([
                0x00, // version 0
                0x00, 0x00, 0x00, // flags
                (baseMediaDecodeTime >> 24),
                (baseMediaDecodeTime >> 16) & 0XFF,
                (baseMediaDecodeTime >> 8) & 0XFF,
                (baseMediaDecodeTime & 0xFF), // baseMediaDecodeTime
            ])),
            MP4.trun(track,
                // sampleDependencyTable.length +
                16 + // tfhd
                16 + // tfdt
                8 +  // traf header
                16 + // mfhd
                8 +  // moof header
                8,    // mdat header
            ),
            // sampleDependencyTable
        );
    }

    /**
     * Generate a track box.
     * @param track {object} a track definition
     * @return {Uint8Array} the track box
     */
    public static trak(track: Track): Uint8Array {
        track.duration = track.duration || 0xffffffff;
        return MP4.box(MP4.types.trak, MP4.tkhd(track), MP4.mdia(track));
    }

    public static trex(track: Track): Uint8Array {
        const id = track.id;
        return MP4.box(MP4.types.trex, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            (id >> 24),
            (id >> 16) & 0XFF,
            (id >> 8) & 0XFF,
            (id & 0xFF), // track_ID
            0x00, 0x00, 0x00, 0x01, // default_sample_description_index
            0x00, 0x00, 0x00, 0x3c, // default_sample_duration
            0x00, 0x00, 0x00, 0x00, // default_sample_size
            0x00, 0x01, 0x00, 0x00, // default_sample_flags
        ]));
    }

    public static trun(track: Track, offset: number): Uint8Array {
        const samples = track.samples || [];
        const len = samples.length;
        const additionalLen = track.isKeyFrame ? 4 : 0;
        const arraylen = 12 + additionalLen + (4 * len);
        const array = new Uint8Array(arraylen);
        offset += 8 + arraylen;
        array.set([
            0x00, // version 0
            0x00, 0x02, (track.isKeyFrame ? 0x05 : 0x01), // flags
            (len >>> 24) & 0xFF,
            (len >>> 16) & 0xFF,
            (len >>> 8) & 0xFF,
            len & 0xFF, // sample_count
            (offset >>> 24) & 0xFF,
            (offset >>> 16) & 0xFF,
            (offset >>> 8) & 0xFF,
            offset & 0xFF, // data_offset
        ], 0);
        if (track.isKeyFrame) {
            array.set([
                0x00, 0x00, 0x00, 0x00,
            ], 12);
        }
        for (let i = 0; i < len; i++) {
            const sample = samples[i];
            const size = sample.size;
            array.set([
                (size >>> 24) & 0xFF,
                (size >>> 16) & 0xFF,
                (size >>> 8) & 0xFF,
                size & 0xFF, // sample_size
            ], 12 + additionalLen + 4 * i);
        }
        return MP4.box(MP4.types.trun, array);
    }

    public static initSegment(tracks: Track[], duration: number, timescale: number): Uint8Array {
        if (!MP4.initalized) {
            MP4.init();
        }
        const movie = MP4.moov(tracks, duration, timescale);
        const result = new Uint8Array(MP4.FTYP.byteLength + movie.byteLength);
        result.set(MP4.FTYP);
        result.set(movie, MP4.FTYP.byteLength);
        return result;
    }

    public static fragmentSegment(sn: number, baseMediaDecodeTime: number, track: Track, payload: Uint8Array): Uint8Array {
        const moof = MP4.moof(sn, baseMediaDecodeTime, track);
        const mdat = MP4.mdat(payload);
        const result = new Uint8Array(MP4.STYP.byteLength + moof.byteLength + mdat.byteLength);
        result.set(MP4.STYP);
        result.set(moof, MP4.STYP.byteLength);
        result.set(mdat, MP4.STYP.byteLength + moof.byteLength);
        return result;
    }
}
