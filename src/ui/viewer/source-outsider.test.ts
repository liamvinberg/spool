import { describe, expect, it } from "vitest";
import { readViewerOutsider } from "./source";

/** An outsider's part of the canvas is checked before the canvas trusts it (spool#174). */

const SIGN_IN = {
	code: "/_spool/sign-in/code",
	resend: "/_spool/sign-in/code/resend",
	verify: "/_spool/sign-in/code/verify",
	name: "/_spool/sign-in/name",
	exchange: "/_spool/sign-in/exchange",
	signOut: "/_spool/sign-out",
	google: "https://spool.page/sign-in/google?link=northwind",
	origin: "https://spool.page",
};
const OUTSIDER = {
	share: { id: "s1", kind: "link", who: [] },
	me: null,
	comments: "/_spool/comments",
	socket: "/_spool/comments/socket",
	signIn: SIGN_IN,
};

describe("an outsider's part of the canvas", () => {
	it("reads one spool.page sends whole, signed in or not", () => {
		expect(readViewerOutsider(OUTSIDER)).toEqual(OUTSIDER);
		const named = { ...OUTSIDER, share: { id: "s2", kind: "people", who: ["Ines"] }, me: { id: "a1", name: "Ines" } };
		const { signIn: _, ...people } = named;
		expect(readViewerOutsider(people)).toEqual(people);
	});

	it("drops one whose sign-in would take a message from anywhere but spool.page, or write elsewhere", () => {
		for (const signIn of [
			{ ...SIGN_IN, origin: "*" },
			{ ...SIGN_IN, origin: "https://spool.page/" },
			{ ...SIGN_IN, origin: "http://spool.page" },
			{ ...SIGN_IN, google: "https://evil.example/sign-in/google" },
			{ ...SIGN_IN, exchange: "https://evil.example/exchange" },
			{ ...SIGN_IN, code: "//evil.example/code" },
		])
			expect(readViewerOutsider({ ...OUTSIDER, signIn })).toBeUndefined();
		expect(readViewerOutsider({ ...OUTSIDER, me: { id: 1, name: "x" } })).toBeUndefined();
		expect(readViewerOutsider({ ...OUTSIDER, share: { id: "s1", kind: "team", who: [] } })).toBeUndefined();
		expect(readViewerOutsider({ ...OUTSIDER, socket: "wss://elsewhere/socket" })).toBeUndefined();
		expect(readViewerOutsider("outsider")).toBeUndefined();
	});
});
