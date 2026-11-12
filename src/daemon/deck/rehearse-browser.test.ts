import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { expect, it } from "vitest";
import { headlessShellArgs } from "../../headless-shell";
import { rehearseTalk } from "../../rehearse-command";
import { type RehearseOutcome, reportOf } from "../../rehearse-report";
import { serveProject, writeDesignFile } from "../../test-helpers";
import type { Finding } from "./rehearse-rules";
import { stripes } from "./stage-browser.test-helpers";

/**
 * A rehearsal's wiring (spool#322): a talk made with one of each fault a rehearsal names, a calm slide between each two,
 * rehearsed through the daemon in the booth's own browser. Each rule and each line of words is proved on its own
 * (`rehearse-rules.test.ts`, `rehearse-report.test.ts`); here, that each fault reaches the rules from the real stage at
 * its slide and beat, and the calm slides say nothing.
 */

async function shellAvailable(): Promise<boolean> {
	try {
		const browser = await chromium.launch({
			channel: "chromium-headless-shell",
			headless: true,
			args: headlessShellArgs(),
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

/** How long a presenter gives the next slide to be ready, here, before pressing on regardless. */
const PAUSE_MS = 2000;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;

const calm = (colour: string, words: string) => `export default function Slide() {
	return (
		<div style={{ background: "${colour}", width: "100%", height: "100%", padding: 80, boxSizing: "border-box" }}>
			<h1 style={{ color: "white", fontSize: 64, margin: 0 }}>${words}</h1>
		</div>
	);
}
`;

const SLIDES: Record<string, string> = {
	opening: calm("#1d3557", "Opening"),
	throws: `export default function Slide(): never {
	throw new Error("the throws slide broke as it came on");
}
`,
	"calm-1": calm("#264653", "Calm one"),
	slow: `export default function Slide() {
	return (
		<div style={{ background: "#2a9d8f", width: "100%", height: "100%" }}>
			<img src="/fixture/slow.png" alt="" style={{ position: "absolute", left: 100, top: 100, width: 400, height: 300 }} />
		</div>
	);
}
`,
	"calm-2": calm("#287271", "Calm two"),
	late: `import { ui } from "spool";

export default function Slide() {
	const beat = ui.beats(["bare", "picture"]);
	return (
		<div style={{ background: "#8ab17d", width: "100%", height: "100%" }}>
			<h1 style={{ margin: 0, padding: 80 }}>A picture comes on the second beat</h1>
			{beat.reached("picture") ? (
				<>
					<img src="/fixture/late.png" alt="" style={{ position: "absolute", left: 600, top: 300, width: 400, height: 300 }} />
					<div style={{ position: "absolute", left: 100, top: 300, width: 400, height: 300, background: "url(/fixture/late-back.png)" }} />
				</>
			) : null}
		</div>
	);
}
`,
	"calm-3": calm("#babb74", "Calm three"),
	twins: `export default function Slide() {
	return (
		<div style={{ background: "#e9c46a", width: "100%", height: "100%", padding: 80, boxSizing: "border-box" }}>
			<span style={{ viewTransitionName: "twin", fontSize: 40 }}>one</span>
			<span style={{ viewTransitionName: "twin", fontSize: 40 }}>two</span>
		</div>
	);
}
`,
	"calm-4": calm("#efb366", "Calm four"),
	cut: `export default function Slide() {
	return (
		<div style={{ background: "#f4a261", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
			<h1 style={{ position: "absolute", left: 900, top: 200, margin: 0, fontSize: 48, whiteSpace: "nowrap" }}>These words run past the edge</h1>
			<div style={{ position: "absolute", left: 100, top: 400, width: 600, height: 60, overflow: "hidden" }}>
				<p style={{ margin: 0, marginLeft: 400, whiteSpace: "nowrap", fontSize: 32 }}>clipped on purpose by its own box</p>
			</div>
			<div style={{ position: "absolute", left: -120, top: 480, fontSize: 220, lineHeight: 1 }}>BIG</div>
		</div>
	);
}
`,
	"calm-5": calm("#ee8959", "Calm five"),
	jumps: `import { ui } from "spool";

export default function Slide() {
	const beat = ui.beats(["one", "two"]);
	return (
		<div style={{ background: "#e76f51", width: "100%", height: "100%", padding: 80, boxSizing: "border-box" }}>
			{beat.reached("two") ? <p className="added" style={{ fontSize: 40, margin: 0 }}>This line pushes the next one down</p> : null}
			<p style={{ fontSize: 40, margin: 0 }}>This line moves when the beat comes</p>
		</div>
	);
}
`,
	"calm-6": calm("#6d597a", "Calm six"),
	gl: `import { useEffect, useRef } from "react";

function Scene() {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const gl = canvas.current?.getContext("webgl");
		gl?.clearColor(0.9, 0.43, 0.32, 1);
		gl?.clear(gl.COLOR_BUFFER_BIT);
	}, []);
	return <canvas ref={canvas} width={120} height={80} style={{ margin: 20 }} />;
}

export default function Slide() {
	return (
		<div style={{ background: "#264653", width: "100%", height: "100%" }}>
			{[1, 2, 3, 4, 5, 6, 7].map((n) => (
				<Scene key={n} />
			))}
		</div>
	);
}
`,
	"calm-7": calm("#355070", "Calm seven"),
	noisy: `import { useEffect } from "react";

export default function Slide() {
	useEffect(() => {
		console.error("the noisy slide said this");
		void fetch("/fixture/missing.json").catch(() => {});
	}, []);
	return (
		<div style={{ background: "#b56576", width: "100%", height: "100%", padding: 80, boxSizing: "border-box" }}>
			<h1 style={{ margin: 0 }}>Noisy</h1>
		</div>
	);
}
`,
	"calm-8": calm("#515575", "Calm eight"),
	"beat-throws": `import { ui } from "spool";

export default function Slide() {
	const beat = ui.beats(["fine", "broken"]);
	if (beat.reached("broken")) throw new Error("the beat-throws slide broke on its second beat");
	return (
		<div style={{ background: "#6d597a", width: "100%", height: "100%", padding: 80, boxSizing: "border-box" }}>
			<h1 style={{ margin: 0 }}>Fine for now</h1>
		</div>
	);
}
`,
	"calm-9": calm("#3d405b", "Calm nine"),
	burn: `import { useEffect } from "react";
import { ui } from "spool";

// it burns its frames on its second beat, on screen: the stage readies a slide before it comes on
export default function Slide() {
	const beat = ui.beats(["calm", "burn"]);
	useEffect(() => {
		if (beat.index !== 1) return;
		let alive = true;
		let left = 3;
		const spin = () => {
			const start = performance.now();
			while (performance.now() - start < 150) {}
			if (alive && --left > 0) requestAnimationFrame(spin);
		};
		requestAnimationFrame(spin);
		return () => {
			alive = false;
		};
	}, [beat.index]);
	return (
		<div style={{ background: "#81b29a", width: "100%", height: "100%", padding: 80, boxSizing: "border-box" }}>
			<h1 style={{ margin: 0 }}>Every frame takes long here</h1>
		</div>
	);
}
`,
	closing: calm("#1d3557", "Closing"),
};

const TALK = Object.keys(SLIDES);
const at = (name: string) => TALK.indexOf(name);

function writeFaultTalk(root: string): void {
	writeDesignFile(root, "frames/faults/deck.json", json({ version: 1, w: 1280, h: 720, slides: TALK }));
	for (const [name, source] of Object.entries(SLIDES))
		writeDesignFile(root, `frames/faults/${name}/frame.tsx`, source);
}

/** A finding as the test reads it: its kind, and where. */
function placed(finding: Finding): string {
	if ("place" in finding)
		return `${finding.kind} ${finding.place.slide}:${finding.place.beat ?? "-"}${finding.place.back ? " back" : ""}`;
	if ("from" in finding) return `${finding.kind} from ${finding.from}`;
	return finding.kind;
}

it("names each fault of a talk at its slide and beat, and nothing of the calm slides between them", {
	timeout: 600_000,
}, async () => {
	if (!(await shellAvailable())) return;
	// the slow slide's picture comes well after a presenter reached it; the late slide's, a while after its beat asked
	let reachedSlow: () => void = () => {};
	const slowReached = new Promise<void>((done) => {
		reachedSlow = done;
	});
	const fixtures: Record<string, { comes: () => Promise<unknown>; png: Buffer }> = {
		"/fixture/slow.png": {
			comes: () => slowReached.then(() => sleep(PAUSE_MS * 2)),
			png: stripes(400, 300, [240, 240, 240], [30, 30, 30]),
		},
		"/fixture/late.png": { comes: () => sleep(1500), png: stripes(400, 300, [250, 200, 40], [20, 40, 90]) },
		"/fixture/late-back.png": { comes: () => sleep(3000), png: stripes(400, 300, [90, 40, 20], [40, 200, 250]) },
	};
	const project = await serveProject({
		experiments: { deck: true },
		booth: {
			systemScheme: async () => "light",
			rehearse: { pauseMs: PAUSE_MS },
			lent: async (context) => {
				await context.route("**/fixture/**", async (route) => {
					const fixture = fixtures[new URL(route.request().url()).pathname];
					if (fixture === undefined) return route.fulfill({ status: 404, body: "" });
					await fixture.comes();
					await route
						.fulfill({ status: 200, body: fixture.png, headers: { "content-type": "image/png" } })
						.catch(() => {});
				});
			},
		},
	});
	writeFaultTalk(project.root);
	const said: string[] = [];
	const narrate = (line: string) => {
		said.push(line);
		if (line.startsWith(`slide ${at("slow") + 1} of`)) reachedSlow();
	};
	const outcome: RehearseOutcome = await rehearseTalk(
		{ daemonUrl: project.url, controlToken: project.controlToken, name: project.name, narrate },
		"faults",
	);
	const found = outcome.findings;
	const report = reportOf(outcome);
	const where = found.map(placed);

	expect(where).toContain(`threw ${at("throws")}:-`);
	expect(found.find((finding) => finding.kind === "threw" && finding.place.slide === at("throws"))).toMatchObject({
		when: "mount",
	});
	expect(where).toContain(`loading ${at("slow")}:0`);
	// an <img> and a background alike: a background says nothing of itself as it loads
	for (const picture of ["late.png", "late-back.png"])
		expect(found).toContainEqual(
			expect.objectContaining({
				kind: "late",
				place: { slide: at("late"), beat: 1 },
				file: expect.objectContaining({ kind: "picture", name: expect.stringMatching(`/fixture/${picture}$`) }),
			}),
		);
	expect(found).toContainEqual(
		expect.objectContaining({
			kind: "move-failed",
			from: at("twins") - 1,
			twice: [expect.objectContaining({ name: "twin", slide: at("twins") })],
		}),
	);
	expect(found).toContainEqual(
		expect.objectContaining({
			kind: "cut",
			place: { slide: at("cut"), beat: 0 },
			edge: "right",
			words: expect.objectContaining({ text: "These words run past the edge" }),
		}),
	);
	expect(found.filter((finding) => finding.kind === "cut")).toHaveLength(1);
	expect(found).toContainEqual(
		expect.objectContaining({
			kind: "layout",
			place: { slide: at("jumps"), beat: 1 },
			causes: [expect.objectContaining({ what: "appeared", tag: "p.added" })],
		}),
	);
	expect(found).toContainEqual(
		expect.objectContaining({ kind: "webgl", place: expect.objectContaining({ slide: at("gl") }), contexts: 7 }),
	);
	expect(found).toContainEqual(
		expect.objectContaining({
			kind: "console",
			place: { slide: at("noisy"), beat: 0 },
			text: "the noisy slide said this",
		}),
	);
	expect(found).toContainEqual(
		expect.objectContaining({ kind: "request", place: { slide: at("noisy"), beat: 0 }, status: 404 }),
	);
	expect(found).toContainEqual(
		expect.objectContaining({ kind: "threw", place: { slide: at("beat-throws"), beat: 1 }, when: "later" }),
	);
	// lag is judged only where the machine can tell; where it can, the slide that burns its frames is the one named
	const lag = found.filter((finding) => finding.kind === "lag" || finding.kind === "unjudged");
	expect(lag.length, where.join("\n")).toBeGreaterThan(0);
	for (const finding of lag) if (finding.kind === "lag") expect(finding.place.slide).toBe(at("burn"));

	// nothing else, and nothing at all of a calm slide
	const faulty = new Set(
		["throws", "slow", "late", "twins", "cut", "jumps", "gl", "noisy", "beat-throws", "burn"].map(at),
	);
	for (const finding of found) {
		if (finding.kind === "move-failed") {
			expect([at("twins") - 1, at("twins")]).toContain(finding.from);
			continue;
		}
		if ("place" in finding)
			expect(faulty.has(finding.place.slide), `${placed(finding)}\n${report.stderr.join("\n")}`).toBe(true);
		else expect(["unjudged"], placed(finding)).toContain(finding.kind);
	}
	expect(report.ok).toBe(false);

	// the pictures: every beat at rest, the moves between slides, and the sheet, where the outcome says
	const folder = join(project.root, outcome.folder);
	expect(outcome.sheets.length).toBeGreaterThan(0);
	for (const sheet of outcome.sheets) expect(existsSync(join(folder, sheet))).toBe(true);
	const stills = readdirSync(join(folder, "stills"));
	expect(stills).toContain("01-opening-1-beat.png");
	expect(stills).toContain(`${String(at("jumps") + 1).padStart(2, "0")}-jumps-2-two.png`);
	expect(stills.filter((still) => still.startsWith("01-02-move-"))).toEqual([]);
	expect(stills).toContain("03-04-move-middle.png");
	// three slides of two beats, and the one that burns
	expect(outcome.beats).toBe(TALK.length + 4);
});
