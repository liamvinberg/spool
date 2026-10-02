import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createPlayerCompiler, type PlayerCompile, playerEtag } from "./play";
import { listProjectFrames } from "./projection";
import type { Webfonts } from "./webfonts";

function webfontsAt(revision: () => number, resolve: Webfonts["resolve"] = async (css) => css): Webfonts {
	return { resolve, read: async () => undefined, revision };
}

function served(compiled: PlayerCompile): { cache: string; text: string } {
	if (compiled.kind !== "ok") throw new Error(compiled.message);
	return { cache: compiled.cache, text: [...compiled.bundle.chunks.values()].join("\n") };
}

/**
 * The player is cached as a frame document is: made of one read of its
 * inputs, under the hash of those bytes, and retired by the webfont revision
 * it was built at (#80).
 */
describe("the player's cache", () => {
	it("retires a bundle when a resolve lands while its hit is rehashed", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		// enough inputs that hashing them hands the event loop back
		const names = Array.from({ length: 400 }, (_, index) => `m${index}`);
		for (const name of names) {
			writeDesignFile(root, join("shared", "many", `${name}.ts`), `export const ${name} = 1;\n`);
		}
		const imports = names.map((name) => `import { ${name} } from "../../shared/many/${name}";`).join("\n");
		writeFrame(root, "fonts", `${imports}\nexport default () => <p>{${names.join(" + ")}}</p>;\n`);
		let revision = 0;
		const player = createPlayerCompiler(
			"0.0.0-test",
			webfontsAt(() => revision),
		);
		const frames = listProjectFrames(root).frames;
		expect(served(await player.getBundle(root, frames)).cache).toBe("miss");

		// a resolve elsewhere, landing while the next request rehashes
		setImmediate(() => revision++);
		const again = served(await player.getBundle(root, frames));

		expect(revision).toBe(1);
		expect(again.cache).toBe("miss");
	});

	it("names the bundle by the webfont revision too, so a browser never keeps fonts a resolve replaced", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		let revision = 0;
		const player = createPlayerCompiler(
			"0.0.0-test",
			webfontsAt(() => revision),
		);
		const frames = listProjectFrames(root).frames;
		const config = { project: "p", projectCapability: "c", start: "home", scenario: "default", frames: {} };

		const before = await player.getBundle(root, frames);
		revision++;
		const after = await player.getBundle(root, frames);

		if (before.kind !== "ok" || after.kind !== "ok") throw new Error("the player did not compile");
		expect(after.cache).toBe("miss");
		expect(playerEtag(after.bundle, config)).not.toBe(playerEtag(before.bundle, config));
	});

	it("keeps a bundle of the sources as read when an edit lands mid-compile, and compiles the edit next", async () => {
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const saying = (words: string) => `export default function Frame() { return <p>${words}</p>; }\n`;
		writeFrame(root, "moving", saying("before the edit"));
		let edited = false;
		// the fonts resolve after the composition and every frame's stylesheet
		const player = createPlayerCompiler(
			"0.0.0-test",
			webfontsAt(
				() => 0,
				async (css) => {
					if (!edited) writeFrame(root, "moving", saying("after the edit"));
					edited = true;
					return css;
				},
			),
		);
		const frames = listProjectFrames(root).frames;

		const first = served(await player.getBundle(root, frames));
		const second = served(await player.getBundle(root, frames));
		const third = served(await player.getBundle(root, frames));

		expect(first.text).toContain("before the edit");
		expect(first.text).not.toContain("after the edit");
		expect(second.cache).toBe("miss");
		expect(second.text).toContain("after the edit");
		expect(third.cache).toBe("hit");
	});
});
