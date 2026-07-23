/**
 * The supervisor wire (#42): the daemon talks to its bun-side PTY supervisor
 * over plain pipes, so terminal bytes and control messages share one stream.
 * Frames are [type u8][length u32 BE][payload] — type 0 raw terminal bytes,
 * type 1 a JSON control message. The supervisor embeds the same logic
 * verbatim; this module is the daemon's side and the contract's test surface.
 */

export const WIRE_DATA = 0;
export const WIRE_CONTROL = 1;

const HEADER = 5;

export interface WireFrame {
	type: number;
	payload: Uint8Array;
}

export function encodeData(payload: Uint8Array): Uint8Array {
	return encodeFrame(WIRE_DATA, payload);
}

export function encodeControl(message: object): Uint8Array {
	return encodeFrame(WIRE_CONTROL, new TextEncoder().encode(JSON.stringify(message)));
}

function encodeFrame(type: number, payload: Uint8Array): Uint8Array {
	const frame = new Uint8Array(HEADER + payload.length);
	frame[0] = type;
	new DataView(frame.buffer).setUint32(1, payload.length);
	frame.set(payload, HEADER);
	return frame;
}

/** A stateful reassembler: push pipe chunks, receive completed frames. */
export function createWireDecoder(): { push(chunk: Uint8Array): WireFrame[] } {
	let pending = new Uint8Array(0);

	function push(chunk: Uint8Array): WireFrame[] {
		const buffer = new Uint8Array(pending.length + chunk.length);
		buffer.set(pending);
		buffer.set(chunk, pending.length);
		const frames: WireFrame[] = [];
		let offset = 0;
		while (buffer.length - offset >= HEADER) {
			const type = buffer[offset] as number;
			const length = new DataView(buffer.buffer, buffer.byteOffset + offset + 1, 4).getUint32(0);
			if (buffer.length - offset - HEADER < length) break;
			frames.push({ type, payload: buffer.slice(offset + HEADER, offset + HEADER + length) });
			offset += HEADER + length;
		}
		pending = buffer.slice(offset);
		return frames;
	}

	return { push };
}
