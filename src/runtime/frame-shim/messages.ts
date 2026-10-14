import { SETTLE_BUDGET_MS } from "../../cover";
import { captureSource } from "./capture-source";
import { contentHeight } from "./content-height";
import { type Altered, alterElement, beginEdit, endEdit, restoreAsked } from "./edit";
import { setFrozen } from "./freeze";
import { nativeRaf, shimConfig } from "./natives";
import { elementTree, familyAt, type Hit, kinChain, pickChain } from "./pick";
import { settle } from "./settle";
import { siteBoxes } from "./sites";
import { restamp } from "./stamps";

/**
 * The host protocol: what the canvas asks of this document, and the answers.
 * The asks that change the document, or read it at length, are held to the one
 * door: this frame's own canvas, at the control origin.
 */

/** Whether a settle the canvas asked for is one this document will wait out. */
function settleAsked(settleMs: unknown): settleMs is number {
	return (
		typeof settleMs === "number" &&
		Number.isFinite(settleMs) &&
		Number.isInteger(settleMs) &&
		settleMs >= 0 &&
		settleMs <= SETTLE_BUDGET_MS
	);
}

let captureInFlight = false;
/**
 * Arrival is reported once per document (#177). A frame arrives once; a
 * second report would be about something the document did later, and the
 * canvas is asking when it may stop standing a picture in front of this one.
 */
let arrivalReported = false;

export function answerHost(): void {
	addEventListener("message", async (event) => {
		const m = event.data;
		if (!m || typeof m !== "object") return;
		if (m.spool === "content-size") {
			const config = shimConfig();
			if (event.source !== parent || event.origin !== config.controlOrigin || !Number.isSafeInteger(m.id)) return;
			let height: number | null = null;
			try {
				height = contentHeight();
			} catch {}
			parent.postMessage({ spool: "content-size", frame: config.frame, id: m.id, width: innerWidth, height }, "*");
			return;
		}
		if (m.spool === "arrive") {
			// The same settle a cover waits out, answered as a bare report (#177).
			// Loaded is mid-arrival: an entry animation is at its beginning where
			// the still photographed its end, and a canvas frame may not have drawn
			// a tick yet. Waiting out the settle is how the cover fades onto the
			// frame its picture is a picture of.
			const config = shimConfig();
			const settleMs = m.settleMs;
			if (
				arrivalReported ||
				event.source !== parent ||
				event.origin !== config.controlOrigin ||
				!settleAsked(settleMs)
			) {
				return;
			}
			arrivalReported = true;
			// A settle that threw still arrived: the canvas is holding a cover on
			// this answer, and its own deadline is the only other thing that frees it.
			try {
				await settle(settleMs, nativeRaf);
			} catch {}
			parent.postMessage({ spool: "arrived", frame: config.frame }, "*");
			return;
		}
		if (m.spool === "pick") {
			const frame = shimConfig().frame;
			let chain: Hit[] = [];
			try {
				chain = pickChain(m.x, m.y, m.selects === true);
			} catch {}
			parent.postMessage({ spool: "picked", frame, id: m.id, chain }, "*");
			return;
		}
		if (m.spool === "kin") {
			const frame = shimConfig().frame;
			let chain: Hit[] = [];
			try {
				chain = kinChain(m.selector, m.step, m.selects === true);
			} catch {}
			parent.postMessage({ spool: "picked", frame, id: m.id, chain }, "*");
			return;
		}
		if (m.spool === "family") {
			const frame = shimConfig().frame;
			let found: ReturnType<typeof familyAt> = null;
			try {
				found = familyAt(m.selector, m.of === "children" ? "children" : "siblings");
			} catch {}
			parent.postMessage(
				{ spool: "generation", frame, id: m.id, chain: found ? found.chain : [], hits: found ? found.hits : [] },
				"*",
			);
			return;
		}
		if (m.spool === "elements") {
			// answered under another name, like family: a same-named reply loops
			// when parent === window
			const frame = shimConfig().frame;
			let nodes: ReturnType<typeof elementTree> = [];
			try {
				nodes = elementTree();
			} catch {}
			parent.postMessage({ spool: "element-tree", frame, id: m.id, nodes }, "*");
			return;
		}
		if (m.spool === "edit" || m.spool === "edit-end") {
			// the two verbs that change the document rather than read it, so they
			// are held to the same door the capture is: this frame's own canvas
			const config = shimConfig();
			if (event.source !== parent || event.origin !== config.controlOrigin) return;
			if (m.spool === "edit-end") {
				endEdit(m.commit === true);
				return;
			}
			try {
				beginEdit(m.selector, m.x, m.y, m.id);
			} catch {
				parent.postMessage({ spool: "edit-open", frame: config.frame, id: m.id, ok: false, text: "" }, "*");
			}
			return;
		}
		if (m.spool === "restore" || m.spool === "restamp" || m.spool === "alter") {
			// all of them change the document, so the same door
			const config = shimConfig();
			if (event.source !== parent || event.origin !== config.controlOrigin) return;
			if (m.spool === "alter") {
				let answer: Altered = { ok: false, owner: null };
				try {
					answer = alterElement(m.id, Array.isArray(m.selectors) ? m.selectors : [], m.act, m.place, m.sources);
				} catch {}
				parent.postMessage(
					{
						spool: "altered",
						frame: config.frame,
						id: m.id,
						ok: answer.ok,
						owner: answer.owner,
						...(answer.chain ? { chain: answer.chain } : {}),
						...(answer.held ? { held: true } : {}),
					},
					"*",
				);
				return;
			}
			if (m.spool === "restamp") {
				try {
					restamp(m.file, Array.isArray(m.shifts) ? m.shifts : []);
				} catch {}
				return;
			}
			let ok = false;
			try {
				ok = restoreAsked(m.id, m.way);
			} catch {}
			parent.postMessage({ spool: "restored", frame: config.frame, id: m.ask, ok }, "*");
			return;
		}
		if (m.spool === "sites") {
			const frame = shimConfig().frame;
			let boxes: ReturnType<typeof siteBoxes> = {};
			try {
				boxes = siteBoxes(m.sites);
			} catch {}
			parent.postMessage({ spool: "site-boxes", frame, id: m.id, boxes }, "*");
			return;
		}
		if (m.spool === "freeze") {
			setFrozen(m.on === true);
			return;
		}
		if (m.spool !== "capture") return;
		const config = shimConfig();
		const frame = config.frame;
		const id = m.id;
		if (
			event.source !== parent ||
			event.origin !== config.controlOrigin ||
			typeof id !== "string" ||
			!/^[0-9a-f]{32}$/.test(id)
		) {
			return;
		}
		// the door above held: the capture answers its own canvas, and only it
		const controlOrigin = config.controlOrigin as string;
		if (captureInFlight) {
			parent.postMessage(
				{ spool: "capture-source", frame, id, error: "capture already in progress" },
				controlOrigin,
			);
			return;
		}
		captureInFlight = true;
		try {
			const settleMs = m.settleMs;
			if (!settleAsked(settleMs)) {
				throw new Error("invalid capture dimensions");
			}
			const source = await captureSource(settleMs);
			parent.postMessage({ spool: "capture-source", frame, id, ...source }, controlOrigin);
		} catch (error) {
			parent.postMessage({ spool: "capture-source", frame, id, error: String(error).slice(0, 240) }, controlOrigin);
		} finally {
			captureInFlight = false;
		}
	});
}
