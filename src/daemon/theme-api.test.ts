import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import type { CompiledClass, CompiledTheme } from "./theme";

/**
 * The compiled theme over the API (#257): what the canvas asks for before it
 * draws a menu, and what it asks about a class somebody typed.
 */

const tokens = `@theme {
  --color-thread: #F5391A;
  --color-muted: #8E8C88;
  --text-base: 13px;
  --text-md: 14px;
  --breakpoint-app: 1280px;
}
`;

function jsonPost(body: unknown): RequestInit {
	return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function setup() {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	writeDesignFile(root, "shared/tokens.css", tokens);
	return { app: makeApp(spoolDir), name };
}

describe("the theme API", () => {
	it("serves the project's tokens first and Tailwind's after", async () => {
		const { app, name } = setup();

		const res = await app.request(`/api/p/${name}/theme`);
		expect(res.status).toBe(200);
		const { theme } = (await res.json()) as { theme: CompiledTheme };

		expect(theme.colour[0]).toEqual({ name: "thread", value: "#F5391A", from: "project" });
		expect(theme.text.find((token) => token.name === "base")?.value).toBe("13px");
		expect(theme.screen.find((token) => token.name === "app")?.from).toBe("project");
		expect(theme.step).toBe(4);
	});

	it("answers for a class the way the compiler does", async () => {
		const { app, name } = setup();

		const res = await app.request(`/api/p/${name}/theme/classes`, jsonPost({ tokens: ["bg-thread", "foo-bar"] }));
		expect(res.status).toBe(200);
		const { compiled } = (await res.json()) as { compiled: CompiledClass[] };

		expect(compiled[0]?.ok).toBe(true);
		expect(compiled[1]).toEqual({ ok: false, token: "foo-bar", reason: "no utility foo-bar" });
	});

	it("takes a list of classes and nothing else", async () => {
		const { app, name } = setup();

		expect((await app.request(`/api/p/${name}/theme/classes`, jsonPost({ tokens: "mt-4" }))).status).toBe(400);
		expect(
			(await app.request(`/api/p/${name}/theme/classes`, jsonPost({ tokens: Array(65).fill("mt-4") }))).status,
		).toBe(400);
	});

	it("has nothing to say about a project nobody opened", async () => {
		const { app } = setup();

		expect((await app.request("/api/p/ghost/theme")).status).toBe(404);
	});

	it("answers a tokens.css that will not compile with the reason", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/tokens.css", '@plugin "tailwindcss-animate";\n');
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/theme`);
		expect(res.status).toBe(422);
		expect(await res.text()).toContain("@plugin and @config are not supported");
	});

	/**
	 * The theme reaches the write lane too (#257): a size this project named
	 * itself has to be read as a size, or writing one takes the colour away.
	 */
	it("writes a size this project named itself without touching its colour", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/tokens.css", tokens);
		const frame =
			'export default function Frame() {\n\treturn <span className="text-muted text-sm">126 kr</span>;\n}\n';
		writeFrame(root, "cart", frame);
		const app = makeApp(spoolDir);
		const source = "frames/cart/frame.tsx:2:9";
		const ops = [{ kind: "set-class", source, token: "text-md", scope: "" }];

		const asked = (await (
			await app.request(`/api/p/${name}/patch/gate`, jsonPost({ frame: "cart", ops }))
		).json()) as {
			ok: boolean;
			fingerprint: string;
		};
		expect(asked.ok).toBe(true);
		const res = await app.request(
			`/api/p/${name}/patch`,
			jsonPost({ frame: "cart", fingerprint: asked.fingerprint, ops }),
		);
		expect(res.status).toBe(200);

		const written = readFileSync(join(root, "design", "frames", "cart", "frame.tsx"), "utf8");
		expect(written).toContain('className="text-muted text-md"');
	});
});
