import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, formatVersion, isBeta, parseVersion } from "./version";

test("reads a plain version, a tag and a beta's", () => {
	assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3 });
	assert.deepEqual(parseVersion("v0.9.1"), { major: 0, minor: 9, patch: 1 });
	assert.deepEqual(parseVersion("0.55.1-beta.12"), { major: 0, minor: 55, patch: 1, beta: 12 });
	assert.equal(formatVersion(parseVersion("0.55.1-beta.12")!), "0.55.1-beta.12");
	assert.equal(isBeta("0.55.1-beta.12"), true);
	assert.equal(isBeta("0.55.1"), false);
});

test("refuses anything it cannot rank", () => {
	for (const text of [
		"1.2",
		"1.2.3.4",
		"1.2.3-rc.1",
		"1.2.3-beta",
		"1.2.3-beta.x",
		"1.2.3-beta.1+abc",
		"v1.2.x",
		"",
		"1.+2.3",
		" 1.2.3",
	]) {
		assert.equal(parseVersion(text), undefined, text);
	}
});

test("ranks by major then minor then patch, a beta below its release and betas by their number", () => {
	const order = ["0.9.1", "0.10.0", "0.10.1-beta.3", "0.10.1-beta.20", "0.10.1", "1.0.0", "1.0.10", "1.2.0"].map(
		(text) => parseVersion(text)!,
	);
	for (let index = 1; index < order.length; index += 1) {
		assert.ok(compareVersions(order[index]!, order[index - 1]!) > 0, formatVersion(order[index]!));
		assert.ok(compareVersions(order[index - 1]!, order[index]!) < 0, formatVersion(order[index]!));
	}
	assert.equal(compareVersions(parseVersion("1.2.3")!, parseVersion("v1.2.3")!), 0);
	assert.equal(compareVersions(parseVersion("1.2.3-beta.4")!, parseVersion("1.2.3-beta.4")!), 0);
});
