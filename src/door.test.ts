import { describe, expect, it } from "vitest";
import { DOOR_HOST, doorAddressFor } from "./door";

describe("doorAddressFor", () => {
	it("is the bare host when the daemon is where the door already looks", () => {
		expect(doorAddressFor("http://127.0.0.1:7766")).toBe(DOOR_HOST);
	});

	it("carries the port when the daemon has moved off it", () => {
		expect(doorAddressFor("http://127.0.0.1:7767")).toBe("local.spool.page/?port=7767");
		expect(doorAddressFor("http://localhost:8123")).toBe("local.spool.page/?port=8123");
	});

	it("treats an absent port as the default, since http means 80 to a URL and 7766 to us", () => {
		expect(doorAddressFor("http://127.0.0.1")).toBe(DOOR_HOST);
	});

	/*
	 * The page probes 127.0.0.1 literally and nothing else, so a daemon bound to
	 * ::1 is not reachable through it. Printing the line anyway would be a lie in
	 * the one place the CLI is supposed to be the truth.
	 */
	it("says nothing when the daemon is somewhere the door cannot reach", () => {
		expect(doorAddressFor("http://[::1]:7766")).toBeUndefined();
	});

	it("says nothing rather than guessing at a url it cannot read", () => {
		expect(doorAddressFor("not a url")).toBeUndefined();
	});
});
