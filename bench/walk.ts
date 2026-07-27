import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import { type Camera, copyProject, freePort, ms, quantile, startDaemon, VIEWPORT, writeCamera } from "./harness.ts";

/**
 * What following a link costs (#96). #93 set the bar at 220 ms — the duration
 * of `animateCamera`'s flight (`canvas.tsx:661`), the thing a same-page walk
 * hides its boot under — with 400 ms as the ceiling, and the number has never
 * been measured. `bench/arrival.ts` (#90) already breaks one arrival into its
 * phases, but it drives that arrival with a *camera move*: the canvas mounts a
 * frame because the camera put it on screen. A walk is the other operation, and
 * the one the canvas exists for — you are inside a frame, you click, you arrive.
 *
 * So this run drives the arrival with a **click**: enter a frame, click the
 * element a flow edge is drawn from, and measure that click to the target's own
 * `loaded` report. Both cases the bar covers, separately, because they differ in
 * cover rather than in work:
 *
 *   - **same page** — `walkTo:1226` flies the camera over 220 ms and the boot
 *     hides under the flight.
 *   - **cross page** — `walkTo:1211` hands off to `switchToPage`, which cuts the
 *     camera rather than flying it, so the boot is fully exposed. The strict case.
 *
 * Every timestamp is epoch milliseconds — `performance.timeOrigin +
 * performance.now()` — because the click happens in a frame's renderer and the
 * loaded report is read in the canvas's, and only an absolute clock joins the
 * two. `bench/arrival.ts` joins its own three views the same way.
 *
 * The phase decomposition below is deliberately a *copy* of arrival.ts's rather
 * than an import: that file is a script that runs on import, and the one phase
 * this run actually cares about is one arrival.ts does not have — the distance
 * from the click to the target document existing at all, which is where the
 * canvas's own walk machinery lives. That distance was the whole of the same-page
 * miss: a self-capture race charged a mounted target 450 ms before its reboot,
 * and #110 deleted it in favour of the target's stored still.
 *
 *   pnpm build
 *   node bench/walk.ts --project ~/projects/matmannen-fc63dba --headed
 *   node bench/walk.ts --project <path> --walks 6 --out walk.json
 *
 * Run it with node's own type stripping, not tsx: the collectors below are
 * serialized into the page by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

interface Options {
	project: string;
	/** How many walks to attempt per case. */
	walks: number;
	/**
	 * How many times to run each walk. Not tidiness: a mounted target's cost used
	 * to be bimodal, because `walkTo` raced its self-capture against a 450 ms
	 * timeout and either won it in a few milliseconds or paid the whole thing, so
	 * one sample landed anywhere. #110 deleted that race; repeats remain the way
	 * to tell a settled cost from a lucky one.
	 */
	repeat: number;
	/**
	 * `from,to` — measure only this pair, and measure it **both ways**: once
	 * through the link the project authored and once through one this run
	 * injects. The two instruments otherwise differ in target as well as in
	 * method, and the same-target pair is the only thing that separates "the
	 * injected link is cheaper" from "that particular target is dearer".
	 */
	pair: { from: string; to: string } | undefined;
	headed: boolean;
	out: string | undefined;
}

function parseArgs(argv: string[]): Options {
	let project = "";
	let walks = 6;
	let repeat = 1;
	let pair: { from: string; to: string } | undefined;
	let headed = true;
	let out: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--walks" && next !== undefined) {
			walks = Number(next);
			i++;
		} else if (arg === "--repeat" && next !== undefined) {
			repeat = Number(next);
			i++;
		} else if (arg === "--pair" && next !== undefined) {
			const [from, to] = next.split(",");
			if (from === undefined || to === undefined) throw new Error("--pair takes <from>,<to>");
			pair = { from, to };
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else if (arg === "--headed") {
			headed = true;
		} else if (arg === "--headless") {
			headed = false;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	if (project === "") throw new Error("--project <path to a spool project root> is required");
	if (!Number.isInteger(walks) || walks <= 0) throw new Error("--walks takes a positive count");
	if (!Number.isInteger(repeat) || repeat <= 0) throw new Error("--repeat takes a positive count");
	return { project, walks, repeat, pair, headed, out };
}

// --- the canvas as it sits on disk --------------------------------------------

interface Placed {
	name: string;
	page: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Every frame in the project and the page it sits on. `harness.densestPage`
 * answers a different question — the one camera that mounts the most — and a
 * walk needs the opposite: a frame anywhere, and its target's page, so that
 * "same page" and "cross page" can be told apart before either is clicked.
 */
function allFrames(root: string): Placed[] {
	const dir = join(root, "design", "frames");
	const placed: Placed[] = [];
	const read = (file: string): Omit<Placed, "name" | "page"> | undefined => {
		if (!existsSync(file)) return undefined;
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(file, "utf8"));
		} catch {
			return undefined;
		}
		const frame = parsed as Partial<Placed>;
		if (typeof frame.x !== "number" || typeof frame.y !== "number") return undefined;
		if (typeof frame.w !== "number" || typeof frame.h !== "number") return undefined;
		return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
	};
	for (const entry of readdirSync(dir)) {
		const direct = read(join(dir, entry, "frame.json"));
		if (direct !== undefined) {
			placed.push({ ...direct, name: entry, page: "" });
			continue;
		}
		let nested: string[];
		try {
			nested = readdirSync(join(dir, entry));
		} catch {
			continue;
		}
		for (const child of nested) {
			const box = read(join(dir, entry, child, "frame.json"));
			if (box !== undefined) placed.push({ ...box, name: child, page: entry });
		}
	}
	return placed;
}

/**
 * The camera a walk starts from: the source frame filling most of the window,
 * which is where entering a frame leaves you anyway (`fitCamera`). A walk is a
 * click made from inside, so the canvas it is made on is the quiet one — the
 * camera is already close, and the frames the overview would have mounted are
 * off screen. Measuring a walk from the overview camera would price the walk
 * against a canvas still mounting thirty documents, which is #90's bar, not this
 * one.
 */
function cameraOn(box: Placed, width: number, height: number, fill: number): Camera {
	const k = Math.min((width * fill) / box.w, (height * fill) / box.h);
	return { k, x: width / 2 - (box.x + box.w / 2) * k, y: height / 2 - (box.y + box.h / 2) * k };
}

// --- what the top document records --------------------------------------------

interface Stamped {
	frame: string;
	/** Epoch milliseconds, so a frame's clock and the canvas's are comparable. */
	t: number;
}

interface HostState {
	loaded: Stamped[];
	/** The walk requests the canvas received, so the postMessage hop can be priced. */
	go: { frame: string; target: string; t: number }[];
	/** Every iframe entering the DOM: a walk claims to boot exactly one document. */
	inserted: Stamped[];
	/** Clicks, stamped inside the frame they happened in and relayed here. */
	clicks: { href: string; t: number }[];
	/**
	 * The canvas's own verdict on each walk, relayed back out of the frame it was
	 * sent to. Without it a rejected walk and a slow one look identical from here:
	 * both are a target that never reported loaded.
	 */
	decisions: { accepted: boolean; reason: string; t: number }[];
}

function hostCollector(): void {
	if (window !== window.top) return;
	const state = { loaded: [], go: [], inserted: [], clicks: [], decisions: [] } as unknown as HostState;
	(globalThis as unknown as { __walk: HostState }).__walk = state;
	const at = (): number => performance.timeOrigin + performance.now();

	window.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as Record<string, unknown> | null;
			if (data === null || typeof data !== "object") return;
			// the click carries its own stamp, taken in the frame's clock at the
			// moment it happened, so how long this message took to arrive cannot
			// contaminate it
			if (typeof data.__benchClick === "number" && typeof data.href === "string") {
				state.clicks.push({ href: data.href, t: data.__benchClick });
				return;
			}
			if (typeof data.__benchDecision === "object" && data.__benchDecision !== null) {
				const verdict = data.__benchDecision as { accepted?: unknown; reason?: unknown };
				state.decisions.push({
					accepted: verdict.accepted === true,
					reason: typeof verdict.reason === "string" ? verdict.reason : "accepted",
					t: at(),
				});
				return;
			}
			if (data.spool === "loaded" && typeof data.frame === "string") {
				state.loaded.push({ frame: data.frame, t: at() });
				return;
			}
			if (data.spool === "go" && typeof data.frame === "string" && typeof data.target === "string") {
				state.go.push({ frame: data.frame, target: data.target, t: at() });
			}
		},
		true,
	);

	const noteIframe = (node: Node): void => {
		if (node instanceof HTMLIFrameElement) state.inserted.push({ frame: node.title, t: at() });
		else if (node instanceof HTMLElement) {
			for (const nested of node.querySelectorAll("iframe")) state.inserted.push({ frame: nested.title, t: at() });
		}
	};
	// document, not documentElement: an init script runs before <html> exists
	new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) noteIframe(node);
	}).observe(document, { childList: true, subtree: true });
}

// --- what the target's own timeline says --------------------------------------

interface FrameTimeline {
	url: string;
	origin: number;
	nav: { responseEnd: number } | undefined;
	resources: { name: string; start: number; end: number }[];
}

function frameTimeline(): FrameTimeline {
	const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
	return {
		url: location.href,
		origin: performance.timeOrigin,
		nav: nav === undefined ? undefined : { responseEnd: nav.responseEnd },
		resources: performance.getEntriesByType("resource").map((entry) => ({
			name: entry.name,
			start: entry.startTime,
			end: (entry as PerformanceResourceTiming).responseEnd,
		})),
	};
}

/** The import map's three pins, and only those — see arrival.ts on why fonts are not modules. */
const MODULE_JS = /\/vendor\/(spool|react|spool-jsx)\.js(?:\?|$)/;
const SCENARIO = /\/scenarios\//;

function frameNameFromUrl(url: string): string | undefined {
	const match = /\/frames\/(.+?)(?:\?|$)/.exec(url);
	if (match?.[1] === undefined) return undefined;
	return decodeURIComponent(match[1]);
}

interface Phases {
	total: number;
	/** Click to the target document existing: the canvas's own walk machinery. */
	decide: number;
	document: number;
	parse: number;
	modules: number;
	/** Module evaluation up to start(), which is where the session handshake waits. */
	seed: number;
	scenario: number;
	render: number;
	/** What the named spans do not account for — they overlap, so this is printed. */
	residual: number;
}

function phasesFor(clickAt: number, loadedAt: number, timeline: FrameTimeline): Phases | undefined {
	const { nav, origin, resources } = timeline;
	if (nav === undefined) return undefined;
	const at = (t: number): number => origin + t;
	const modules = resources.filter((entry) => MODULE_JS.test(entry.name));
	const scenario = resources
		.filter((entry) => SCENARIO.test(entry.name))
		.sort((left, right) => left.start - right.start)[0];

	const docEnd = at(nav.responseEnd);
	const moduleStart = modules.length === 0 ? docEnd : at(Math.min(...modules.map((entry) => entry.start)));
	const moduleEnd = modules.length === 0 ? docEnd : at(Math.max(...modules.map((entry) => entry.end)));
	const scenarioStart = scenario === undefined ? moduleEnd : at(scenario.start);
	const scenarioEnd = scenario === undefined ? moduleEnd : at(scenario.end);

	const phases: Phases = {
		total: loadedAt - clickAt,
		// the whole of the canvas's contribution: the go message's hop, walkTo,
		// the docNonce bump, and the browser starting the new document
		decide: origin - clickAt,
		document: docEnd - origin,
		parse: moduleStart - docEnd,
		modules: moduleEnd - moduleStart,
		seed: scenarioStart - moduleEnd,
		scenario: scenarioEnd - scenarioStart,
		render: loadedAt - scenarioEnd,
		residual: 0,
	};
	phases.residual =
		phases.total -
		(phases.decide + phases.document + phases.parse + phases.modules + phases.seed + phases.scenario + phases.render);
	return phases;
}

// --- planning the walks --------------------------------------------------------

interface EdgeSite {
	via: "data-go" | "ui.go" | "term.go";
	path: string;
	line: number;
	anchor?: { line: number; col: number };
	conditional?: true;
}

interface FlowEdge {
	from: string;
	to: string;
	certainty: "will" | "might";
	sites: EdgeSite[];
	missing?: true;
}

interface Plan {
	from: string;
	to: string;
	/** Same page or across one — the two cases the bar covers. */
	kind: "same-page" | "cross-page";
	fromPage: string;
	toPage: string;
	/**
	 * Every way this edge's element might be found, best first. A list rather
	 * than one key because whether an element renders is a fact about the DOM,
	 * not about the source: a `might` site is one the parser saw inside a branch,
	 * and the branch may well be the one the frame booted into. Resolving it
	 * statically dropped four walks out of four on the first run.
	 */
	candidates: { how: string; selector: string }[];
	/**
	 * A link the bench put in the frame's own DOM rather than one the project
	 * authored. `bindDataGo` reads `data-go` off the DOM at click time
	 * (`frame-runtime.ts:784`), so an injected carrier takes the identical path —
	 * navigate, the embedded walk post, the canvas's `go`, `walkTo` — and
	 * `walkRejectionReason` asks only that the target be a real frame.
	 *
	 * It exists because the two cases this run has to separate are not equally
	 * available. matmannen authors **no cross-page `data-go` at all**: every one
	 * of its cross-page edges is a `ui.go` wrapped in a component, and a
	 * component carries no `data-spool-source`, so neither this bench nor spool's
	 * own arrows can find the element to click. Rather than let the strict case
	 * go unmeasured, the run authors the link itself — and measures the same-page
	 * case both ways, so the injected instrument can be checked against the
	 * natural one instead of trusted.
	 */
	injected: boolean;
}

/** The shim's own key (`document.ts:834`): the compile-time stamp, verbatim. */
function stampKey(site: EdgeSite): string | undefined {
	return site.anchor === undefined ? undefined : `${site.path}:${site.anchor.line}:${site.anchor.col}`;
}

function planWalks(edges: FlowEdge[], frames: Map<string, Placed>, perCase: number): Plan[] {
	const plans: Plan[] = [];
	for (const edge of edges) {
		if (edge.missing === true || edge.from === edge.to) continue;
		const from = frames.get(edge.from);
		const to = frames.get(edge.to);
		if (from === undefined || to === undefined) continue;
		const candidates: { how: string; selector: string }[] = [];
		// the rendered attribute first: a data-go carrier wrapped in a shared
		// component stamps where it is authored (shared/ui/…), so its stamp is not
		// the site's — the shim keeps this same fallback for the same reason
		if (edge.sites.some((site) => site.via === "data-go")) {
			candidates.push({ how: "data-go", selector: `[data-go="${edge.to}"]` });
		}
		// then the compile-time stamp of every site claiming the edge, unconditional
		// ones first: a ui.go site has no attribute and the stamp is all there is
		for (const site of [...edge.sites].sort(
			(a, b) => (a.conditional === undefined ? 0 : 1) - (b.conditional === undefined ? 0 : 1),
		)) {
			const key = stampKey(site);
			if (key !== undefined) candidates.push({ how: "stamp", selector: `[data-spool-source="${key}"]` });
		}
		if (candidates.length === 0) continue;
		plans.push({
			from: edge.from,
			to: edge.to,
			kind: from.page === to.page ? "same-page" : "cross-page",
			fromPage: from.page,
			toPage: to.page,
			candidates,
			injected: false,
		});
	}
	// spread across source frames first: eight walks out of one frame price one
	// frame's boot eight times, which is a smaller claim than it looks
	const take = (kind: Plan["kind"]): Plan[] => {
		const pool = plans.filter((plan) => plan.kind === kind);
		const chosen: Plan[] = [];
		const used = new Set<string>();
		for (const round of [0, 1]) {
			for (const plan of pool) {
				if (chosen.length >= perCase) break;
				if (round === 0 && used.has(plan.from)) continue;
				if (chosen.includes(plan)) continue;
				used.add(plan.from);
				chosen.push(plan);
			}
		}
		return chosen;
	};
	return [...take("same-page"), ...take("cross-page")];
}

/**
 * The injected walks: one source frame, walking to a target on its own page and
 * to a target on every other page. Pages are taken largest first, because
 * `switchToPage` hands the arriving camera a whole page of frames and the
 * premise under test — that a walk boots exactly one document — is weakest on
 * the page that holds the most.
 */
function injectedWalks(source: Placed, frames: Placed[], perCase: number): Plan[] {
	const plan = (to: Placed): Plan => ({
		from: source.name,
		to: to.name,
		kind: source.page === to.page ? "same-page" : "cross-page",
		fromPage: source.page,
		toPage: to.page,
		candidates: [],
		injected: true,
	});
	const sameHere = frames.filter((frame) => frame.page === source.page && frame.name !== source.name);
	const byPage = new Map<string, Placed[]>();
	for (const frame of frames) {
		if (frame.page === source.page) continue;
		const held = byPage.get(frame.page);
		if (held === undefined) byPage.set(frame.page, [frame]);
		else held.push(frame);
	}
	const pages = [...byPage.entries()].sort(([, a], [, b]) => b.length - a.length);
	const across: Plan[] = [];
	for (const [, held] of pages) {
		if (across.length >= perCase) break;
		const first = held[0];
		if (first !== undefined) across.push(plan(first));
	}
	return [...sameHere.slice(0, perCase).map(plan), ...across];
}

// --- one walk -------------------------------------------------------------------

interface WalkResult extends Plan {
	ok: boolean;
	why?: string;
	/** Whether the target already held a document when the click landed. */
	targetWasMounted?: boolean;
	/** How the click was delivered — a real mouse press, or a dispatched one. */
	via?: "mouse" | "dispatch";
	clickToLoaded?: number | undefined;
	/** Click to the canvas receiving the walk request: the postMessage hop. */
	clickToGo?: number | undefined;
	/** Documents the walk caused. #96's premise is that this is one. */
	documentsBooted?: number | undefined;
	/** Which ones, so "the target" and "the target and six strangers" read differently. */
	booted?: string[] | undefined;
	phases?: Phases | undefined;
}

const ENTER_TIMEOUT_MS = 20_000;
const WALK_TIMEOUT_MS = 20_000;

async function runWalk(context: BrowserContext, url: string, plan: Plan): Promise<WalkResult> {
	const page = await context.newPage();
	const fail = async (why: string): Promise<WalkResult> => {
		await page.close();
		return { ...plan, ok: false, why };
	};
	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });

		// the source frame has to be real and finished before its own click can be
		// timed: a click into a booting document measures the boot, not the walk
		const iframe = `iframe[title=${JSON.stringify(plan.from)}]`;
		await page.waitForSelector(iframe, { timeout: ENTER_TIMEOUT_MS });
		await page
			.waitForFunction(
				(name) =>
					(globalThis as unknown as { __walk: HostState }).__walk.loaded.some((entry) => entry.frame === name),
				plan.from,
				{ timeout: ENTER_TIMEOUT_MS },
			)
			.catch(() => undefined);
		// and the canvas has to have stopped mounting around it, or the walk is
		// priced against a canvas still draining its own queue
		await settle(page, 1200, 15_000);

		// --- enter, because a walk from an unentered frame is rejected ----------
		// `walkRejectionReason` (protocol.ts:211) turns a `go` from any frame that
		// is not the entered one into "inactive" — going inside is what makes a
		// frame's links live at all.
		const box = await page.locator(iframe).boundingBox();
		if (box === null) return await fail("source frame has no box");
		await page.mouse.dblclick(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
		const entered = await page
			.waitForFunction(
				(name) => {
					const el = document.querySelector(`iframe[title=${JSON.stringify(name)}]`);
					return el !== null && getComputedStyle(el).pointerEvents === "auto";
				},
				plan.from,
				{ timeout: ENTER_TIMEOUT_MS },
			)
			.then(
				() => true,
				() => false,
			);
		if (!entered) return await fail("never entered the source frame");
		// entering flies the camera; let it land before the click
		await page.waitForTimeout(1200);

		const frame = page.frames().find((candidate) => frameNameFromUrl(candidate.url()) === plan.from);
		if (frame === undefined) return await fail("source frame document not found");

		// --- arm the frame and find the element the edge is drawn from ----------
		// The stamping listener goes in here rather than through an init script:
		// a frame document is `sandbox="allow-scripts"` on an opaque origin, and
		// playwright's per-context init scripts do not reach it — the first run
		// of this bench stamped no clicks at all and reported it as a walk that
		// never arrived. Installed at the one moment it is needed instead, which
		// is also the moment the frame is known to exist.
		//
		// Every candidate in order, first one that renders with a box wins: an
		// element with no box is not a click a person could make.
		const marked = await frame.evaluate(
			({ candidates, inject }: { candidates: Plan["candidates"]; inject: string }) => {
				document.addEventListener(
					"click",
					() => {
						// capture phase, so the stamp is taken before bindDataGo's own
						// bubble-phase listener and before React's root handler
						window.parent.postMessage(
							{ __benchClick: performance.timeOrigin + performance.now(), href: location.href },
							"*",
						);
					},
					true,
				);
				// the canvas replies to the frame that asked, never to the top document
				window.addEventListener("message", (event: MessageEvent) => {
					const data = event.data as Record<string, unknown> | null;
					if (data === null || typeof data !== "object" || data.spool !== "walk-decision") return;
					window.parent.postMessage(
						{ __benchDecision: { accepted: data.accepted === true, reason: data.reason ?? "accepted" } },
						"*",
					);
				});

				if (inject !== "") {
					// a carrier of the bench's own. bindDataGo reads the attribute off
					// the DOM at click time, so this is the same walk by the same route.
					const carrier = document.createElement("button");
					carrier.setAttribute("data-go", inject);
					carrier.setAttribute("data-bench-click", "1");
					carrier.textContent = "go";
					carrier.style.cssText =
						"position:fixed;left:8px;top:8px;width:72px;height:36px;z-index:2147483647;opacity:0.01";
					document.body.append(carrier);
					return { how: "injected data-go", selector: '[data-bench-click="1"]', seen: null };
				}

				for (const candidate of candidates) {
					for (const el of document.querySelectorAll(candidate.selector)) {
						const rect = el.getBoundingClientRect();
						if (rect.width < 1 || rect.height < 1) continue;
						el.setAttribute("data-bench-click", "1");
						return { how: candidate.how, selector: candidate.selector, seen: null };
					}
				}
				// nothing matched: say what the frame does hold, so "no element" can be
				// told apart from "wrong frame"
				return {
					how: "",
					selector: "",
					seen: {
						url: location.href,
						gos: [...document.querySelectorAll("[data-go]")].map((el) => el.getAttribute("data-go")).join(","),
						stamps: document.querySelectorAll("[data-spool-source]").length,
					},
				};
			},
			{ candidates: plan.candidates, inject: plan.injected ? plan.to : "" },
		);
		if (marked.seen !== null) {
			return await fail(
				`no element renders for this edge — the frame holds ${marked.seen.stamps} stamps and data-go [${marked.seen.gos}]`,
			);
		}

		// --- the click ---------------------------------------------------------
		const before = await page.evaluate((name) => {
			const state = (globalThis as unknown as { __walk: HostState }).__walk;
			return {
				loaded: state.loaded.length,
				clicks: state.clicks.length,
				inserted: state.inserted.length,
				mounted: document.querySelector(`iframe[title=${JSON.stringify(name)}]`) !== null,
			};
		}, plan.to);

		// a real press through the canvas's own hit testing is the faithful
		// version; a dispatched one is the fallback, because a frame drawn under a
		// CSS transform inside a cross-origin iframe can defeat the hit test
		// without anything being wrong with the walk
		let via: "mouse" | "dispatch" = "mouse";
		try {
			await frame.click('[data-bench-click="1"]', { timeout: 4000 });
		} catch {
			via = "dispatch";
			await frame.evaluate(() => (document.querySelector('[data-bench-click="1"]') as HTMLElement | null)?.click());
		}

		// --- the arrival -------------------------------------------------------
		const landed = await page
			.waitForFunction(
				({ name, seen }: { name: string; seen: number }) => {
					const state = (globalThis as unknown as { __walk: HostState }).__walk;
					return state.loaded.slice(seen).some((entry) => entry.frame === name);
				},
				{ name: plan.to, seen: before.loaded },
				{ timeout: WALK_TIMEOUT_MS, polling: 16 },
			)
			.then(
				() => true,
				() => false,
			);
		if (!landed) {
			// "never loaded" covers a rejected walk, a click that reached nothing and
			// a genuinely slow arrival, and those are three different findings. Say
			// which: the canvas's own verdict is relayed back out of the frame.
			const after = await page.evaluate(
				(seen: { clicks: number }) => {
					const held = (globalThis as unknown as { __walk: HostState }).__walk;
					return {
						clicked: held.clicks.length > seen.clicks,
						go: held.go.length,
						decisions: held.decisions.map(
							(entry) => `${entry.accepted ? "accepted" : "rejected"}:${entry.reason}`,
						),
					};
				},
				{ clicks: before.clicks },
			);
			const verdict = after.decisions.at(-1);
			return await fail(
				!after.clicked
					? `the click never fired (element ${marked.selector})`
					: verdict !== undefined
						? `walk ${verdict}`
						: after.go === 0
							? "the click fired but caused no walk request"
							: "the walk was requested but the target never reported loaded",
			);
		}

		const state = await page.evaluate((seen: number) => {
			const held = (globalThis as unknown as { __walk: HostState }).__walk;
			return {
				loaded: held.loaded.slice(seen.valueOf()),
				clicks: held.clicks,
				go: held.go,
				inserted: held.inserted,
			};
		}, before.loaded);
		const click = state.clicks.at(-1);
		if (click === undefined || state.clicks.length === before.clicks) return await fail("no click was stamped");
		const clickAt = click.t;
		const loaded = state.loaded.find((entry) => entry.frame === plan.to);
		if (loaded === undefined) return await fail("the target's loaded report went missing");
		const go = state.go.find((entry) => entry.target === plan.to && entry.t >= clickAt);

		// what the walk actually booted, which is #96's premise stated as a number.
		// Named rather than counted: "two documents" and "the target plus one the
		// page switch brought with it" are different findings.
		const boots = state.inserted
			.filter((entry) => entry.t >= clickAt && entry.t <= loaded.t)
			.map((entry) => entry.frame);

		let phases: Phases | undefined;
		const target = page.frames().find((candidate) => frameNameFromUrl(candidate.url()) === plan.to);
		if (target !== undefined) {
			try {
				phases = phasesFor(clickAt, loaded.t, await target.evaluate(frameTimeline));
			} catch {
				// the frame went away while being read; the total still stands
			}
		}

		await page.close();
		return {
			...plan,
			ok: true,
			targetWasMounted: before.mounted,
			via,
			clickToLoaded: loaded.t - clickAt,
			clickToGo: go === undefined ? undefined : go.t - clickAt,
			documentsBooted: boots.length,
			booted: boots,
			phases,
		};
	} catch (error) {
		return await fail(`threw — ${String(error).slice(0, 140)}`);
	}
}

/** Hold until the canvas stops inserting iframes. */
async function settle(page: Page, quietMs: number, timeoutMs: number): Promise<void> {
	let count = -1;
	let since = Date.now();
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await page.waitForTimeout(150);
		const next = await page.evaluate(() => document.querySelectorAll("iframe").length);
		if (next !== count) {
			count = next;
			since = Date.now();
			continue;
		}
		if (Date.now() - since >= quietMs) return;
	}
}

// --- reporting -------------------------------------------------------------------

const BAR_MS = 220;
const CEILING_MS = 400;

function caseTable(rows: WalkResult[]): string {
	const lines = [
		`| case | link | n | p50 | p95 | worst | vs 220 ms | vs 400 ms |`,
		`|---|---|---|---|---|---|---|---|`,
	];
	for (const kind of ["same-page", "cross-page"] as const) {
		for (const injected of [false, true]) {
			const took = rows
				.filter((row) => row.kind === kind && row.injected === injected && row.clickToLoaded !== undefined)
				.map((row) => row.clickToLoaded ?? Number.NaN)
				.sort((a, b) => a - b);
			const label = injected ? "injected" : "authored";
			if (took.length === 0) {
				lines.push(`| ${kind} | ${label} | 0 | — | — | — | — | — |`);
				continue;
			}
			const p50 = quantile(took, 0.5);
			lines.push(
				`| ${kind} | ${label} | ${took.length} | ${ms(p50)} | ${ms(quantile(took, 0.95))} | ${ms(took.at(-1) ?? Number.NaN)} | ${p50 <= BAR_MS ? "pass" : "**miss**"} | ${p50 <= CEILING_MS ? "pass" : "**miss**"} |`,
			);
		}
	}
	return lines.join("\n");
}

function walkTable(rows: WalkResult[]): string {
	const lines = [
		`| walk | case | link | target mounted | click → loaded | → go | docs booted | click |`,
		`|---|---|---|---|---|---|---|---|`,
	];
	for (const row of rows) {
		const head = `| ${row.from} → ${row.to} | ${row.kind} | ${row.injected ? "injected" : "authored"} |`;
		if (!row.ok) {
			lines.push(`${head} — | dropped: ${row.why} | — | — | — |`);
			continue;
		}
		lines.push(
			`${head} ${row.targetWasMounted === true ? "yes" : "no"} | ${ms(row.clickToLoaded ?? Number.NaN)} | ${ms(row.clickToGo ?? Number.NaN)} | ${row.documentsBooted ?? "—"} | ${row.via} |`,
		);
	}
	return lines.join("\n");
}

const PHASE_LABELS: { key: keyof Omit<Phases, "total">; label: string }[] = [
	{ key: "decide", label: "click → target document exists" },
	{ key: "document", label: "document request" },
	{ key: "parse", label: "parse + inline shim" },
	{ key: "modules", label: "module graph (vendor)" },
	{ key: "seed", label: "evaluate + session handshake" },
	{ key: "scenario", label: "scenario fetch" },
	{ key: "render", label: "first render → loaded" },
	{ key: "residual", label: "unaccounted (spans overlap)" },
];

function phaseTable(rows: WalkResult[], kind: Plan["kind"]): string {
	const phases = rows
		.filter((row) => row.kind === kind && row.phases !== undefined)
		.map((row) => row.phases as Phases);
	if (phases.length === 0) return `_no phase decomposition for ${kind}_`;
	const column = (pick: (row: Phases) => number): number[] => phases.map(pick).sort((a, b) => a - b);
	const total = quantile(
		column((row) => row.total),
		0.5,
	);
	const lines = [`| phase | p50 | worst | share of p50 |`, `|---|---|---|---|`];
	for (const { key, label } of PHASE_LABELS) {
		const sorted = column((row) => row[key]);
		const p50 = quantile(sorted, 0.5);
		lines.push(
			`| ${label} | ${ms(p50)} | ${ms(sorted.at(-1) ?? Number.NaN)} | ${total > 0 ? `${((p50 / total) * 100).toFixed(0)}%` : "—"} |`,
		);
	}
	lines.push(
		`| **click → loaded** | **${ms(total)}** | **${ms(column((row) => row.total).at(-1) ?? Number.NaN)}** | |`,
	);
	return lines.join("\n");
}

// --- the run ---------------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = copyProject(options.project);
	const frames = allFrames(root);
	if (frames.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const byName = new Map(frames.map((frame) => [frame.name, frame]));
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	process.stderr.write(`bench: ${url} (copy of ${options.project}, ${frames.length} frames)\n`);

	let browser: Browser | undefined;
	const results: WalkResult[] = [];
	try {
		browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});

		// the link graph, read through the canvas's own page so the control
		// capability travels with it
		const scout = await browser.newContext({ viewport: VIEWPORT });
		const scoutPage = await scout.newPage();
		await scoutPage.goto(url, { waitUntil: "domcontentloaded" });
		const flows = (await scoutPage.evaluate(async (project: string) => {
			const token = (globalThis as unknown as { __SPOOL_CONTROL__?: string }).__SPOOL_CONTROL__ ?? "";
			const response = await fetch(`/api/p/${encodeURIComponent(project)}/flows`, {
				headers: { "x-spool-control": token },
			});
			return (await response.json()) as { edges: FlowEdge[] };
		}, name)) as { edges: FlowEdge[] };
		await scout.close();

		const authored = planWalks(flows.edges, byName, options.walks);
		// the injected set walks out of the frame the authored set already proves
		// can be entered and clicked, so the same-page pair is a true control:
		// same source, same canvas, one link the project wrote and one this run did
		const anchorFrame = byName.get(authored[0]?.from ?? "") ?? frames[0];
		const wanted = options.pair;
		const plans =
			wanted !== undefined
				? // one pair, both ways: the only comparison that holds the target
					// fixed while the instrument changes
					[
						...authored.filter((plan) => plan.from === wanted.from && plan.to === wanted.to),
						...(byName.has(wanted.from) && byName.has(wanted.to)
							? [
									{
										...(authored.find((plan) => plan.from === wanted.from && plan.to === wanted.to) ??
											({
												from: wanted.from,
												to: wanted.to,
												kind:
													byName.get(wanted.from)?.page === byName.get(wanted.to)?.page
														? "same-page"
														: "cross-page",
												fromPage: byName.get(wanted.from)?.page ?? "",
												toPage: byName.get(wanted.to)?.page ?? "",
												candidates: [],
											} satisfies Omit<Plan, "injected">)),
										injected: true,
									} satisfies Plan,
								]
							: []),
					]
				: anchorFrame === undefined
					? authored
					: [...authored, ...injectedWalks(anchorFrame, frames, options.walks)];
		const same = plans.filter((plan) => plan.kind === "same-page").length;
		process.stderr.write(
			`bench: ${flows.edges.length} edges in the graph, ${plans.length} walks planned (${same} same-page, ${plans.length - same} cross-page; ${plans.filter((plan) => plan.injected).length} injected out of ${anchorFrame?.name})\n`,
		);
		if (plans.length === 0) throw new Error("the project's link graph has no walkable edge");

		// One discarded pass. A fresh daemon compiles every frame it is asked for,
		// and a first-ever boot measures the toolchain rather than the walk.
		process.stderr.write("bench: warming the daemon\n");
		const first = plans[0];
		if (first !== undefined) {
			const source = byName.get(first.from);
			if (source !== undefined) {
				writeCamera(root, cameraOn(source, VIEWPORT.width, VIEWPORT.height, 0.8), source.page);
				const warm = await browser.newContext({ viewport: VIEWPORT });
				const warmPage = await warm.newPage();
				await warmPage.goto(url, { waitUntil: "domcontentloaded" });
				await warmPage.waitForTimeout(20_000);
				await warm.close();
				// the canvas persists its own camera on settle; a save in flight when
				// the context closed can land after the next planned one is written
				await new Promise((wait) => setTimeout(wait, 1500));
			}
		}

		for (const plan of plans) {
			const source = byName.get(plan.from);
			if (source === undefined) continue;
			process.stderr.write(
				`bench: ${plan.kind} ${plan.injected ? "injected" : "authored"} ${plan.from} → ${plan.to}\n`,
			);
			for (let pass = 0; pass < options.repeat; pass++) {
				writeCamera(root, cameraOn(source, VIEWPORT.width, VIEWPORT.height, 0.8), source.page);
				const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
				await context.addInitScript(hostCollector);
				const result = await runWalk(context, url, plan);
				process.stderr.write(
					`bench:   ${result.ok ? `${ms(result.clickToLoaded ?? Number.NaN)} ms, booted [${(result.booted ?? []).join(" ")}]` : `dropped — ${result.why}`}\n`,
				);
				results.push(result);
				await context.close();
				// the same guard the warm pass needs: let the canvas's own camera save
				// land before the next one is planned over it
				await new Promise((wait) => setTimeout(wait, 1200));
				// a plan that cannot resolve an element will not resolve one on the
				// second pass either — repeating it just spends a minute saying so
				if (!result.ok && result.why?.startsWith("no element renders") === true) break;
			}
		}
	} finally {
		await browser?.close();
		daemon.stop();
	}

	const landed = results.filter((row) => row.ok);
	process.stdout.write(`\n## Following a link: ${landed.length} of ${results.length} walks measured\n\n`);
	process.stdout.write(`${caseTable(landed)}\n\n`);
	process.stdout.write(`${walkTable(results)}\n\n`);
	for (const kind of ["same-page", "cross-page"] as const) {
		process.stdout.write(`### ${kind}\n\n${phaseTable(landed, kind)}\n\n`);
	}
	const mounted = landed.filter((row) => row.targetWasMounted === true);
	if (mounted.length > 0 && mounted.length < landed.length) {
		const cold = landed.filter((row) => row.targetWasMounted !== true);
		const median = (rows: WalkResult[]): number =>
			quantile(
				rows.map((row) => row.clickToLoaded ?? Number.NaN).sort((a, b) => a - b),
				0.5,
			);
		process.stdout.write(
			`Target already mounted at click time: ${ms(median(mounted))} p50 over ${mounted.length}; hibernated: ${ms(median(cold))} p50 over ${cold.length}.\n`,
		);
	}
	if (options.out !== undefined) {
		writeFileSync(options.out, `${JSON.stringify({ project: options.project, results }, null, 2)}\n`);
		process.stderr.write(`bench: wrote ${options.out}\n`);
	}
}

await main();
