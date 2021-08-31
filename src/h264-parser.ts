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

export type SPS = {
    profile_idc: number;
    constraint_set_flags: number;
    level_idc: number;
    seq_parameter_set_id: number;
    pic_width_in_mbs_minus1: number;
    pic_height_in_map_units_minus1: number;
    frame_mbs_only_flag: number;
    frame_crop_left_offset: number;
    frame_crop_right_offset: number;
    frame_crop_top_offset: number;
    frame_crop_bottom_offset: number;
    sar: [number, number];
};

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
        const {
            pic_width_in_mbs_minus1,
            frame_crop_left_offset,
            frame_crop_right_offset,
            frame_mbs_only_flag,
            pic_height_in_map_units_minus1,
            frame_crop_top_offset,
            frame_crop_bottom_offset,
            sar
        } = this.parseSPS(data);

        const sarScale = sar[0] / sar[1];
        return {
            width: Math.ceil((((pic_width_in_mbs_minus1 + 1) * 16) - frame_crop_left_offset * 2 - frame_crop_right_offset * 2) * sarScale),
            height: ((2 - frame_mbs_only_flag) * (pic_height_in_map_units_minus1 + 1) * 16) -
                ((frame_mbs_only_flag ? 2 : 4) * (frame_crop_top_offset + frame_crop_bottom_offset)),
        }
    }

    public static parseSPS(data: Uint8Array): SPS {
        const decoder = new BitStream(data);
        let frame_crop_left_offset = 0;
        let frame_crop_right_offset = 0;
        let frame_crop_top_offset = 0;
        let frame_crop_bottom_offset = 0;
        decoder.readUByte();

        const profile_idc = decoder.readUByte();
        const constraint_set_flags = decoder.readUByte(); // constraint_set[0-5]_flag + reserved_zero_2bits u(2),
        const level_idc = decoder.readBits(8); // level_idc u(8)
        const seq_parameter_set_id = decoder.readUEG(); // seq_parameter_set_id
        // some profiles have more optional data we don't need
        if (profile_idc === 100 ||
            profile_idc === 110 ||
            profile_idc === 122 ||
            profile_idc === 244 ||
            profile_idc === 44 ||
            profile_idc === 83 ||
            profile_idc === 86 ||
            profile_idc === 118 ||
            profile_idc === 128 ||
            profile_idc === 138 ||
            profile_idc === 139 ||
            profile_idc === 134) {
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
        const pic_width_in_mbs_minus1 = decoder.readUEG();
        const pic_height_in_map_units_minus1 = decoder.readUEG();
        const frame_mbs_only_flag = decoder.readBits(1);
        if (frame_mbs_only_flag === 0) {
            decoder.skipBits(1); // mb_adaptive_frame_field_flag
        }
        decoder.skipBits(1); // direct_8x8_inference_flag
        if (decoder.readBoolean()) { // frame_cropping_flag
            frame_crop_left_offset = decoder.readUEG();
            frame_crop_right_offset = decoder.readUEG();
            frame_crop_top_offset = decoder.readUEG();
            frame_crop_bottom_offset = decoder.readUEG();
        }
        const vui_parameters_present_flag = decoder.readBoolean();
        let aspect_ratio_info_present_flag = false;
        let sar: [number, number] = [1, 1];
        if (vui_parameters_present_flag) {
            aspect_ratio_info_present_flag = decoder.readBoolean();
            if (aspect_ratio_info_present_flag) {
                const aspectRatioIdc = decoder.readUByte();
                switch (aspectRatioIdc) {
                    case 1: sar = [1, 1]; break;
                    case 2: sar = [12, 11]; break;
                    case 3: sar = [10, 11]; break;
                    case 4: sar = [16, 11]; break;
                    case 5: sar = [40, 33]; break;
                    case 6: sar = [24, 11]; break;
                    case 7: sar = [20, 11]; break;
                    case 8: sar = [32, 11]; break;
                    case 9: sar = [80, 33]; break;
                    case 10: sar = [18, 11]; break;
                    case 11: sar = [15, 11]; break;
                    case 12: sar = [64, 33]; break;
                    case 13: sar = [160, 99]; break;
                    case 14: sar = [4, 3]; break;
                    case 15: sar = [3, 2]; break;
                    case 16: sar = [2, 1]; break;
                    case 255: {
                        sar = [decoder.readUByte() << 8 | decoder.readUByte(), decoder.readUByte() << 8 | decoder.readUByte()];
                        break;
                    }
                    default: {
                        debug.error(`  H264: Unknown aspectRatioIdc=${aspectRatioIdc}`);
                    }
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
            profile_idc,
            constraint_set_flags,
            level_idc,
            seq_parameter_set_id,
            pic_width_in_mbs_minus1,
            pic_height_in_map_units_minus1,
            frame_mbs_only_flag,
            frame_crop_left_offset,
            frame_crop_right_offset,
            frame_crop_top_offset,
            frame_crop_bottom_offset,
            sar,
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
