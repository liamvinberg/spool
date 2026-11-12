import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { compositionOf, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../../test-helpers";

/**
 * A talk's stage document at the serve seam (spool#265, spool#316). How it plays is proven in a browser
 * (`stage-browser.test.ts`); here it is what the daemon composes for it.
 */

const slideTsx = (words: string) => `export default function Slide() {\n\treturn <p>${words}</p>;\n}\n`;

it("composes a talk's stage of its own slides, and leaves the project's player whole", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	mkdirSync(spoolDir, { recursive: true });
	writeFileSync(join(spoolDir, "config.json"), JSON.stringify({ experimental: { deck: true } }));
	const { root, name } = makeProject(spoolDir);
	writeDesignFile(
		root,
		"frames/talk/deck.json",
		JSON.stringify({ version: 1, w: 1280, h: 720, slides: ["one", "two"] }),
	);
	writeFrame(root, "talk/one", slideTsx("slide-one-words"));
	writeFrame(root, "talk/two", slideTsx("slide-two-words"));
	// a project's other frames are none of the talk's: composing them was seconds on a large canvas, before a slide showed
	writeFrame(root, "elsewhere", slideTsx("elsewhere-words"));
	const app = makeApp(spoolDir);

	const asked = await app.request(`/api/p/${name}/deck-stage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ page: "talk" }),
	});
	expect(asked.status).toBe(200);
	const { address } = (await asked.json()) as { address: string };
	const at = new URL(address);
	const doc = await (await app.request(`${at.pathname}${at.search}`)).text();
	const entry = doc.match(/<script type="module">import "(\/play\/[^"]+)";<\/script>/)?.[1];
	expect(entry, "the stage document imports its composition").toBeDefined();
	const stage = await compositionOf(app, `<script type="module">import "${entry}";</script>`);
	expect(stage.all).toContain("slide-one-words");
	expect(stage.all).toContain("slide-two-words");
	expect(stage.all).not.toContain("elsewhere-words");

	// the canvas's play of the project still composes every frame
	const player = await compositionOf(app, await (await app.request(`/play/${name}`)).text());
	expect(player.all).toContain("elsewhere-words");
	expect(player.all).toContain("slide-one-words");
});
