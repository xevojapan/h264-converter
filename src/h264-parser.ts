import H264Remuxer from './h264-remuxer';
import { Track } from './types';
import BitStream from './util/bit-stream';
import * as debug from './util/debug';
import NALU from './util/NALU';

// tslint:disable:member-ordering
// tslint:disable:no-bitwise

export interface SEIMessage {
    type: number;
}

export default class H264Parser {
    private track: Track;

    constructor(private remuxer: H264Remuxer) {
        this.track = remuxer.mp4track;
    }

    private parseSEI(sei: Uint8Array): boolean {
        const messages = H264Parser.readSEI(sei);
        for (const m of messages) {
            switch (m.type) {
                case 0:
                    // switch buffered frame mode
                    this.track.seiBuffering = true;
                    break;
                case 5:
                    return true;
                default:
                    break;
            }
        }
        return false;
    }

    private parseSPS(sps: Uint8Array): void {
        const config = H264Parser.readSPS(sps);

        this.track.width = config.width;
        this.track.height = config.height;
        this.track.sps = [sps];
        // this.track.timescale = this.remuxer.timescale;
        // this.track.duration = this.remuxer.timescale; // TODO: extract duration for non-live client
        this.track.codec = 'avc1.';

        const codecArray = new DataView(sps.buffer, sps.byteOffset + 1, 4);
        for (let i = 0; i < 3; ++i) {
            let h = codecArray.getUint8(i).toString(16);
            if (h.length < 2) {
                h = '0' + h;
            }
            this.track.codec += h;
        }
    }

    private parsePPS(pps: Uint8Array): void {
        this.track.pps = [pps];
    }

    public parseNAL(unit: NALU): boolean {
        if (!unit) {
            return false;
        }

        let push = false;
        // debug.log(`NALU type=${unit.type()}`);
        switch (unit.type()) {
            case NALU.NDR:
            case NALU.IDR:
                push = true;
                break;
            case NALU.SEI:
                push = this.parseSEI(unit.getData().subarray(4));
                break;
            case NALU.SPS:
                // debug.log(`  SPS: length=${unit.getData().byteLength}, ${unit.getData().subarray(4).byteLength}`);
                this.parseSPS(unit.getData().subarray(4));
                debug.log(` Found SPS type NALU frame.`);
                if (!this.remuxer.readyToDecode && this.track.pps.length > 0 && this.track.sps.length > 0) {
                    this.remuxer.readyToDecode = true;
                }
                break;
            case NALU.PPS:
                this.parsePPS(unit.getData().subarray(4));
                debug.log(` Found PPS type NALU frame.`);
                if (!this.remuxer.readyToDecode && this.track.pps.length > 0 && this.track.sps.length > 0) {
                    this.remuxer.readyToDecode = true;
                }
                break;
            default:
                debug.log(` Found Unknown type NALU frame. type=${unit.type()}`);
                break;
        }
        return push;
    }

    /**
     * Advance the ExpGolomb decoder past a scaling list. The scaling
     * list is optionally transmitted as part of a sequence parameter
     * set and is not relevant to transmuxing.
     * @param decoder {BitStream} exp golomb decoder
     * @param count {number} the number of entries in this scaling list
     * @see Recommendation ITU-T H.264, Section 7.3.2.1.1.1
     */
    private static skipScalingList(decoder: BitStream, count: number): void {
        let lastScale = 8;
        let nextScale = 8;
        for (let j = 0; j < count; j++) {
            if (nextScale !== 0) {
                const deltaScale = decoder.readEG();
                nextScale = (lastScale + deltaScale + 256) % 256;
            }
            lastScale = (nextScale === 0) ? lastScale : nextScale;
        }
    }

    /**
     * Read a sequence parameter set and return some interesting video
     * properties. A sequence parameter set is the H264 metadata that
     * describes the properties of upcoming video frames.
     * @param data {Uint8Array} the bytes of a sequence parameter set
     * @return {object} an object with configuration parsed from the
     * sequence parameter set, including the dimensions of the
     * associated video frames.
     */
    private static readSPS(data: Uint8Array): { width: number; height: number; } {
        const decoder = new BitStream(data);
        let frameCropLeftOffset = 0;
        let frameCropRightOffset = 0;
        let frameCropTopOffset = 0;
        let frameCropBottomOffset = 0;
        let sarScale = 1;
        decoder.readUByte();
        const profileIdc = decoder.readUByte(); // profile_idc
        decoder.skipBits(6); // constraint_set[0-5]_flag, u(6)
        decoder.skipBits(2); // reserved_zero_2bits u(2),
        decoder.skipBits(8); // level_idc u(8)
        decoder.skipUEG(); // seq_parameter_set_id
        // some profiles have more optional data we don't need
        if (profileIdc === 100 ||
            profileIdc === 110 ||
            profileIdc === 122 ||
            profileIdc === 244 ||
            profileIdc === 44 ||
            profileIdc === 83 ||
            profileIdc === 86 ||
            profileIdc === 118 ||
            profileIdc === 128 ||
            profileIdc === 138 ||
            profileIdc === 139 ||
            profileIdc === 134) {
            const chromaFormatIdc = decoder.readUEG();
            if (chromaFormatIdc === 3) {
                decoder.skipBits(1); // separate_colour_plane_flag
            }
            decoder.skipUEG(); // bit_depth_luma_minus8
            decoder.skipUEG(); // bit_depth_chroma_minus8
            decoder.skipBits(1); // qpprime_y_zero_transform_bypass_flag
            if (decoder.readBoolean()) { // seq_scaling_matrix_present_flag
                const scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
                for (let i = 0; i < scalingListCount; ++i) {
                    if (decoder.readBoolean()) { // seq_scaling_list_present_flag[ i ]
                        if (i < 6) {
                            H264Parser.skipScalingList(decoder, 16);
                        } else {
                            H264Parser.skipScalingList(decoder, 64);
                        }
                    }
                }
            }
        }
        decoder.skipUEG(); // log2_max_frame_num_minus4
        const picOrderCntType = decoder.readUEG();
        if (picOrderCntType === 0) {
            decoder.readUEG(); // log2_max_pic_order_cnt_lsb_minus4
        } else if (picOrderCntType === 1) {
            decoder.skipBits(1); // delta_pic_order_always_zero_flag
            decoder.skipEG(); // offset_for_non_ref_pic
            decoder.skipEG(); // offset_for_top_to_bottom_field
            const numRefFramesInPicOrderCntCycle = decoder.readUEG();
            for (let i = 0; i < numRefFramesInPicOrderCntCycle; ++i) {
                decoder.skipEG(); // offset_for_ref_frame[ i ]
            }
        }
        decoder.skipUEG(); // max_num_ref_frames
        decoder.skipBits(1); // gaps_in_frame_num_value_allowed_flag
        const picWidthInMbsMinus1 = decoder.readUEG();
        const picHeightInMapUnitsMinus1 = decoder.readUEG();
        const frameMbsOnlyFlag = decoder.readBits(1);
        if (frameMbsOnlyFlag === 0) {
            decoder.skipBits(1); // mb_adaptive_frame_field_flag
        }
        decoder.skipBits(1); // direct_8x8_inference_flag
        if (decoder.readBoolean()) { // frame_cropping_flag
            frameCropLeftOffset = decoder.readUEG();
            frameCropRightOffset = decoder.readUEG();
            frameCropTopOffset = decoder.readUEG();
            frameCropBottomOffset = decoder.readUEG();
        }
        if (decoder.readBoolean()) {
            // vui_parameters_present_flag
            if (decoder.readBoolean()) {
                // aspect_ratio_info_present_flag
                let sarRatio;
                const aspectRatioIdc = decoder.readUByte();
                switch (aspectRatioIdc) {
                    case 1: sarRatio = [1, 1]; break;
                    case 2: sarRatio = [12, 11]; break;
                    case 3: sarRatio = [10, 11]; break;
                    case 4: sarRatio = [16, 11]; break;
                    case 5: sarRatio = [40, 33]; break;
                    case 6: sarRatio = [24, 11]; break;
                    case 7: sarRatio = [20, 11]; break;
                    case 8: sarRatio = [32, 11]; break;
                    case 9: sarRatio = [80, 33]; break;
                    case 10: sarRatio = [18, 11]; break;
                    case 11: sarRatio = [15, 11]; break;
                    case 12: sarRatio = [64, 33]; break;
                    case 13: sarRatio = [160, 99]; break;
                    case 14: sarRatio = [4, 3]; break;
                    case 15: sarRatio = [3, 2]; break;
                    case 16: sarRatio = [2, 1]; break;
                    case 255: {
                        sarRatio = [decoder.readUByte() << 8 | decoder.readUByte(), decoder.readUByte() << 8 | decoder.readUByte()];
                        break;
                    }
                    default: {
                        debug.error(`  H264: Unknown aspectRatioIdc=${aspectRatioIdc}`);
                    }
                }
                if (sarRatio) {
                    sarScale = sarRatio[0] / sarRatio[1];
                }
            }
            if (decoder.readBoolean()) {
                // overscan_info_present_flag
                decoder.skipBits(1); // overscan_appropriate_flag
            }

            if (decoder.readBoolean()) {
                // video_signal_type_present_flag
                decoder.skipBits(4); // video_format u(3) + video_full_range_flag (1)
                if (decoder.readBoolean()) {
                    // colour_description_present_flag
                    decoder.skipBits(24); // colour_primaries u(8) + transfer_characteristics u(8) + matrix_coefficients u(8)
                }
            }
            if (decoder.readBoolean()) {
                // chroma_loc_info_present_flag
                decoder.skipUEG(); // chroma_sample_loc_type_top_field
                decoder.skipUEG(); // chroma_sample_loc_type_bottom_field
            }
            if (decoder.readBoolean()) {
                if (decoder.bitsAvailable > 64) {
                        // timing_info_present_flag
                    const unitsInTick = decoder.readUInt(); // num_units_in_tick
                    const timeScale = decoder.readUInt(); // time_scale
                    const fixedFrameRate = decoder.readBoolean(); // fixed_frame_rate_flag
                    const frameDuration = timeScale / (2 * unitsInTick);
                    debug.log(`timescale: ${timeScale}; unitsInTick: ${unitsInTick}; ` +
                        `fixedFramerate: ${fixedFrameRate}; avgFrameDuration: ${frameDuration}`);
                } else {
                    debug.log(`Truncated VUI (${decoder.bitsAvailable})`);
                }
            }
        }
        return {
            width: Math.ceil((((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2) * sarScale),
            height: ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) -
                    ((frameMbsOnlyFlag ? 2 : 4) * (frameCropTopOffset + frameCropBottomOffset)),
        };
    }

    // private static readSliceType(decoder: BitStream): number {
    //     // skip NALu type
    //     decoder.readUByte();
    //     // discard first_mb_in_slice
    //     decoder.readUEG();
    //     // return slice_type
    //     return decoder.readUEG();
    // }

    private static readSEI(data: Uint8Array): SEIMessage[] {
        // debug.log(`read SEI: ${data}`);
        const decoder = new BitStream(data);
        decoder.skipBits(8);

        const result: SEIMessage[] = [];
        while (decoder.bitsAvailable > 3 * 8) {
            result.push(this.readSEIMessage(decoder));
        }
        return result;
    }
    private static readSEIMessage(decoder: BitStream): SEIMessage {
        function get(): number {
            let result = 0;
            while (true) {
                const value = decoder.readUByte();
                result += value;
                if (value !== 0xff) {
                    break;
                }
            }
            return result;
        }

        const payloadType = get();
        const payloadSize = get();
        return this.readSEIPayload(decoder, payloadType, payloadSize);
    }
    private static readSEIPayload(decoder: BitStream, type: number, size: number): SEIMessage {
        let result: SEIMessage;
        // debug.log(`  SEI Frame: type=${type}, size=${size}`);
        switch (type) {
            default:
                result = { type };
                decoder.skipBits(size * 8);
        }
        decoder.skipBits(decoder.bitsAvailable % 8);
        return result;
    }
}
