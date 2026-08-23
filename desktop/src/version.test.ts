import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, formatVersion, parseVersion } from "./version";

test("reads a plain version and a tag", () => {
	assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3 });
	assert.deepEqual(parseVersion("v0.9.1"), { major: 0, minor: 9, patch: 1 });
});

test("refuses anything it cannot rank", () => {
	for (const text of ["1.2", "1.2.3.4", "1.2.3-rc.1", "v1.2.x", "", "1.+2.3", " 1.2.3"]) {
		assert.equal(parseVersion(text), undefined, text);
	}
});

test("ranks by major then minor then patch", () => {
	const order = ["0.9.1", "0.10.0", "1.0.0", "1.0.10", "1.2.0"].map((text) => parseVersion(text)!);
	for (let index = 1; index < order.length; index += 1) {
		assert.ok(compareVersions(order[index]!, order[index - 1]!) > 0);
	}
	assert.equal(compareVersions(parseVersion("1.2.3")!, parseVersion("v1.2.3")!), 0);
});

test("prints what it read", () => {
	assert.equal(formatVersion(parseVersion("v10.0.2")!), "10.0.2");
});
