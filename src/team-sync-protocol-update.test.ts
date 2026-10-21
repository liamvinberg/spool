import { describe, expect, it } from "vitest";
import { ACCEPTED_PROTOCOLS, CLOSE_FORMAT, CLOSE_PROTOCOL, canvasFormat, PROTOCOL_VERSION } from "./team-sync-protocol";

/**
 * An older Spool on a team (#206): the protocols spool.page takes, the close that says "update Spool", and the format
 * a canvas.json says. The literals below are the same ones spool-cloud's mirror is tested against, so the two can't
 * drift apart unseen.
 */

const encode = (text: string) => new TextEncoder().encode(text);

describe("an older Spool", () => {
	it("is taken one protocol behind, and told apart by its close: protocol or format", () => {
		expect(PROTOCOL_VERSION).toBe(2);
		expect(ACCEPTED_PROTOCOLS).toEqual([1, 2]);
		expect(CLOSE_PROTOCOL).toBe(4406);
		expect(CLOSE_FORMAT).toBe(4426);
	});

	it("reads the format a canvas.json says, and none from anything else", () => {
		expect(canvasFormat(encode('{\n\t"format": 2,\n\t"history": false\n}\n'))).toBe(2);
		expect(canvasFormat(encode('{"format":1}'))).toBe(1);
		expect(canvasFormat(encode('{"history":false}'))).toBeUndefined();
		expect(canvasFormat(encode('{"format":"2"}'))).toBeUndefined();
		expect(canvasFormat(encode('{"format":1.5}'))).toBeUndefined();
		expect(canvasFormat(encode('{"format":-1}'))).toBeUndefined();
		expect(canvasFormat(encode("[2]"))).toBeUndefined();
		expect(canvasFormat(encode("not json"))).toBeUndefined();
	});
});
