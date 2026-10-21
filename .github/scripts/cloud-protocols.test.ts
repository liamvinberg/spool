import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../../src/team-sync-protocol.ts";
import { declaredProtocol, NO_ROUTE, protocolVerdict } from "./cloud-protocols.ts";

describe("release check of the cloud's accepted protocols", () => {
	it("reads the PROTOCOL_VERSION the sync protocol module exports", () => {
		const source = readFileSync(new URL("../../src/team-sync-protocol.ts", import.meta.url), "utf8");
		expect(declaredProtocol(source)).toBe(PROTOCOL_VERSION);
		expect(() => declaredProtocol("export const VERSION = 2;")).toThrow(/no PROTOCOL_VERSION/);
	});

	it("passes when the cloud accepts the release's protocol, alone or among others", () => {
		expect(protocolVerdict(2, { protocols: [2] }).ok).toBe(true);
		expect(protocolVerdict(3, { protocols: [3, 2] }).ok).toBe(true);
	});

	it("refuses a protocol the deployed cloud doesn't accept, saying to deploy the cloud first", () => {
		const verdict = protocolVerdict(3, { protocols: [2] });
		expect(verdict.ok).toBe(false);
		expect(verdict.message).toMatch(/accepts protocols 2, not 3\. Deploy spool-cloud first/);
	});

	it("refuses an answer that isn't a list of protocols", () => {
		for (const answer of [null, {}, { protocols: 2 }, { protocols: ["2"] }, "<html>"])
			expect(protocolVerdict(2, answer).ok).toBe(false);
	});

	it("passes protocol 2 against a cloud from before the route, and refuses any other", () => {
		expect(protocolVerdict(2, NO_ROUTE).ok).toBe(true);
		const verdict = protocolVerdict(3, NO_ROUTE);
		expect(verdict.ok).toBe(false);
		expect(verdict.message).toMatch(/accepts only protocol 2, not 3\. Deploy spool-cloud first/);
	});
});
