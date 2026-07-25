import { beforeEach, expect, it, vi } from "vitest";
import { makeTempDir, markProject, writeDesignFile, writeFrame } from "./test-helpers";

const parserMetrics = vi.hoisted(() => ({ count: 0 }));

vi.mock("@babel/parser", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@babel/parser")>();
	return {
		...actual,
		parse(source: string, options: Parameters<typeof actual.parse>[1]) {
			parserMetrics.count += 1;
			return actual.parse(source, options);
		},
	};
});

import { checkDesign } from "./check";

beforeEach(() => {
	parserMetrics.count = 0;
});

it("indexes each source once across a long permissive star-export chain", () => {
	const root = makeTempDir();
	markProject(root);
	const chainLength = 80;
	writeDesignFile(root, "shared/importmap.json", '{ "imports": { "mapped": "https://example.test/mapped.js" } }\n');
	for (let index = 0; index < chainLength; index += 1) {
		const target = index === chainLength - 1 ? "mapped" : `./barrel-${index + 1}`;
		writeDesignFile(root, `shared/barrel-${index}.ts`, `export * from ${JSON.stringify(target)};\n`);
	}
	writeFrame(
		root,
		"home",
		'import { remoteOnly } from "../../shared/barrel-0";\nexport default function Home() { return <main>{String(remoteOnly)}</main>; }\n',
	);

	expect(checkDesign(root)).toEqual([]);
	expect(parserMetrics.count).toBe(chainLength + 1);
});
