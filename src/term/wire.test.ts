import { describe, expect, it } from "vitest";
import { createWireDecoder, encodeControl, encodeData, WIRE_CONTROL, WIRE_DATA } from "./wire";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("wire frames", () => {
	it("round-trips a data frame", () => {
		const decoder = createWireDecoder();
		const frames = decoder.push(encodeData(bytes("hello")));
		expect(frames).toEqual([{ type: WIRE_DATA, payload: bytes("hello") }]);
	});

	it("round-trips a control frame as JSON", () => {
		const decoder = createWireDecoder();
		const frames = decoder.push(encodeControl({ resize: { cols: 90, rows: 30 } }));
		expect(frames).toHaveLength(1);
		expect(frames[0]?.type).toBe(WIRE_CONTROL);
		expect(JSON.parse(new TextDecoder().decode(frames[0]?.payload))).toEqual({ resize: { cols: 90, rows: 30 } });
	});

	it("reassembles frames split at every possible boundary", () => {
		const encoded = new Uint8Array([...encodeData(bytes("ab")), ...encodeControl({ exit: { code: 3 } })]);
		for (let cut = 1; cut < encoded.length; cut++) {
			const decoder = createWireDecoder();
			const frames = [...decoder.push(encoded.slice(0, cut)), ...decoder.push(encoded.slice(cut))];
			expect(frames).toHaveLength(2);
			expect(new TextDecoder().decode(frames[0]?.payload)).toBe("ab");
			expect(JSON.parse(new TextDecoder().decode(frames[1]?.payload))).toEqual({ exit: { code: 3 } });
		}
	});

	it("decodes several frames from one chunk", () => {
		const decoder = createWireDecoder();
		const frames = decoder.push(new Uint8Array([...encodeData(bytes("a")), ...encodeData(bytes("b"))]));
		expect(frames.map((f) => new TextDecoder().decode(f.payload))).toEqual(["a", "b"]);
	});

	it("passes an empty data frame through", () => {
		const decoder = createWireDecoder();
		expect(decoder.push(encodeData(new Uint8Array(0)))).toEqual([{ type: WIRE_DATA, payload: new Uint8Array(0) }]);
	});
});
