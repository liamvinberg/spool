import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { SpoolError } from "./errors";
import { skillText } from "./skill";
import { makeProject, makeTempDir, serveProject, writeFrame } from "./test-helpers";
import { mintPlayerUrl, readFlows, readSelection, resolveRegisteredProject } from "./verbs";

function controlToken(spoolDir: string): string {
	const token = readDaemonState(spoolDir)?.controlToken;
	if (token === undefined) throw new Error("test daemon has no control token");
	return token;
}

/**
 * The thin verbs (#25) as direct function calls — cwd resolution against temp
 * dirs, reads against a really-served daemon on an ephemeral port.
 */

const plainTsx = `export default function Frame() {
	return <main>hi</main>;
}
`;

describe("resolveRegisteredProject", () => {
	it("resolves by walk-up from any nested cwd", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const nested = join(root, "src", "deep");
		mkdirSync(nested, { recursive: true });

		expect(resolveRegisteredProject(spoolDir, nested)).toEqual({ root, name });
	});

	it("refuses a cwd outside any project, pointing at init", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		expect(() => resolveRegisteredProject(spoolDir, makeTempDir())).toThrowError(/spool init/);
	});

	it("refuses an unregistered project, pointing at open — registration stays explicit", () => {
		// a project inited against one machine's registry, resolved against another's
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const otherSpoolDir = join(makeTempDir(), ".spool");

		expect(() => resolveRegisteredProject(otherSpoolDir, root)).toThrowError(/spool open/);
	});
});

describe("selection and flows over the daemon", () => {
	it("prints the live selection payload", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		writeFrame(root, "cart", plainTsx);
		const token = controlToken(spoolDir);
		await fetch(`${url}/api/p/${name}/selection`, {
			method: "PUT",
			headers: { "content-type": "application/json", "X-Spool-Control": token },
			body: JSON.stringify({ frames: ["cart"] }),
		});

		const printed = await readSelection(url, name, token);

		expect(JSON.parse(printed)).toEqual([
			{ kind: "frame", frame: "cart", path: "design/frames/cart/frame.tsx", size: { w: 390, h: 844 } },
		]);
	});

	it("prints the link graph", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		writeFrame(root, "cart", `export default function Frame() {\n\treturn <a data-go="pay">pay</a>;\n}\n`);
		writeFrame(root, "pay", plainTsx);

		const printed = await readFlows(url, name, controlToken(spoolDir));

		expect(JSON.parse(printed)).toEqual({
			frames: ["cart", "pay"],
			edges: [
				{
					from: "cart",
					to: "pay",
					certainty: "will",
					sites: [{ via: "data-go", path: "frames/cart/frame.tsx", line: 2, anchor: { line: 2, col: 9 } }],
				},
			],
			unreadable: [],
		});
	});
});

describe("url", () => {
	it("mints a player-session URL for a frame that exists", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		writeFrame(root, "cart", plainTsx);

		await expect(mintPlayerUrl(url, name, "cart", controlToken(spoolDir))).resolves.toBe(
			`${url}/play/${name}?frame=cart`,
		);
	});

	it("refuses a frame that does not exist, teaching how one is born", async () => {
		const { spoolDir, name, url } = await serveProject();

		await expect(mintPlayerUrl(url, name, "ghost", controlToken(spoolDir))).rejects.toThrowError(
			/design\/frames\/ghost\/frame\.tsx/,
		);
	});
});

describe("skill", () => {
	it("prints the overview with every verb and the topic index", () => {
		const text = skillText();
		for (const verb of ["init", "open", "selection", "flows", "shot", "logs", "url", "skill"]) {
			expect(text).toContain(`spool ${verb}`);
		}
	});

	it("prints every listed topic", () => {
		for (const topic of ["frames", "terminals", "flows", "scenarios", "mock", "styling", "verbs"]) {
			expect(skillText(topic).length).toBeGreaterThan(100);
		}
	});

	it("refuses an unknown topic, listing the real ones", () => {
		expect(() => skillText("vibes")).toThrowError(SpoolError);
		expect(() => skillText("vibes")).toThrowError(/frames, terminals, flows, scenarios, mock, styling, verbs/);
	});

	it("opens with the completeness contract and carries the fixed laws verbatim", () => {
		expect(skillText()).toContain("if it isn't here, spool doesn't do it");
		expect(skillText()).toContain("never write app-owned files");
		expect(skillText("styling")).toContain("cn() only, never template-literal class strings");
	});

	it("teaches that terminal source stays inert until it has an OS sandbox", () => {
		expect(skillText()).toContain("static disabled surface");
		const terminals = skillText("terminals");
		expect(terminals).toContain("does not compile, evaluate, or execute term.tsx");
		expect(terminals).toContain("inside an OS sandbox");
		expect(terminals).toContain("no terminal input, output, process lifecycle, restart, or shared live session");
	});

	it("indexes every topic as its own overview row", () => {
		for (const topic of ["frames", "terminals", "flows", "scenarios", "mock", "styling", "verbs"]) {
			expect(skillText()).toMatch(new RegExp(`^  ${topic} {2,}\\S`, "m"));
		}
	});
});
