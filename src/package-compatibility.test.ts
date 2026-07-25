import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

interface Manifest {
	engines?: { node?: string };
}

const requireFromTest = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Manifest;

function versionAtLeast(version: number[], floor: number[]): boolean {
	for (let index = 0; index < Math.max(version.length, floor.length); index += 1) {
		const actual = version[index] ?? 0;
		const required = floor[index] ?? 0;
		if (actual !== required) return actual > required;
	}
	return true;
}

function supports(version: number[], range: string): boolean {
	return range.split("||").some((branch) => {
		const comparator = branch.trim().match(/^(>=|\^)\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
		if (comparator === null) return false;
		const floor = comparator.slice(2).map((part) => Number(part ?? 0));
		if (!versionAtLeast(version, floor)) return false;
		return comparator[1] === ">=" || version[0] === floor[0];
	});
}

it("keeps direct Babel packages compatible with the advertised Node floor", () => {
	const advertised = manifest.engines?.node?.match(/^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
	expect(advertised, "package engines.node must expose one exact lower bound").not.toBeNull();
	const nodeFloor = (advertised?.slice(1) ?? []).map((part) => Number(part ?? 0));

	for (const dependency of ["@babel/parser", "@babel/types"]) {
		const dependencyManifest = requireFromTest(requireFromTest.resolve(`${dependency}/package.json`)) as Manifest;
		const range = dependencyManifest.engines?.node;
		expect(range, `${dependency} engines.node`).toBeDefined();
		expect(supports(nodeFloor, range ?? ""), `${dependency} ${range} must support Node ${nodeFloor.join(".")}`).toBe(
			true,
		);
	}
});
