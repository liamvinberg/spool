import { SETTLE_BUDGET_MS } from "../../cover";
import { MOVE_HOLD_MS } from "../canvas/lifecycle";
import { arriveMessage, freezeMessage, parseFrameMessage } from "../canvas/protocol";
import { BOOTS_AT_ONCE, nextBoots } from "./viewer-live";

/**
 * The documents of the read-only canvas's live frames, kept outside React: which are mounted, which are booting,
 * and which have arrived. Each frame's shell reads its own entry (`entry`), so a document reporting in renders that
 * one shell and nothing else of the canvas.
 *
 * A live frame's document boots behind its picture, or its placeholder, and is shown once it has arrived: loaded,
 * then the arrival report the Mac's canvas waits for (#177), or that report's deadline for a document that never
 * gives one. A few boot at a time (`BOOTS_AT_ONCE`), nearest the middle of the view first, and none starts while
 * the camera moves. One that never reports loaded failed: it is let go, and its frame stands as its picture until
 * the frame is made again.
 *
 * A frame made again (a teammate's save, the canvas coming back after being away) boots its new document behind
 * the one on screen, which stays until the new one has arrived, so the frame never blinks to nothing. Arrived
 * documents hold their animation while the camera moves, as the Mac's do (#171).
 */

/** How long a document has to report loaded before it is taken for broken. */
export const LOAD_DEADLINE_MS = 10_000;
/**
 * How long a loaded document has to say it has arrived before it is shown anyway: the shim's own settle and the
 * two hops around it, as on the Mac (`lifecycle.ts`). A document served where the shim does not answer (a link
 * share's host, whose origin is not the one it was compiled for) is shown at this deadline.
 */
export const ARRIVE_DEADLINE_MS = SETTLE_BUDGET_MS + 600;

export type DocumentPhase = "booting" | "loaded" | "arrived";

export interface FieldDocument {
	/** Which making of the frame it is: a frame made again mounts a new one. */
	revision: string;
	src: string;
	phase: DocumentPhase;
}

/** One live frame: its documents, oldest first, the newest booting behind the one shown until it arrives. */
export interface FieldEntry {
	documents: readonly FieldDocument[];
	/** Whether any of them has arrived, which is when the shell takes the frame from its picture. */
	shown: boolean;
	/** Whether its newest document is on its way: waiting its turn, or booting. */
	loading: boolean;
}

interface Mounted extends FieldDocument {
	iframe: HTMLIFrameElement | null;
	timer: ReturnType<typeof setTimeout> | undefined;
}

export class FieldDocuments {
	/** The live frames, nearest the middle first. */
	private order: string[] = [];
	private readonly mounted = new Map<string, Mounted[]>();
	private readonly entries = new Map<string, FieldEntry>();
	/** Frames whose document failed, with the making that failed: a newer one is tried again. */
	private readonly failures = new Map<string, string>();
	private readonly listeners = new Set<() => void>();
	private moving = false;
	private held = false;
	private thaw: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;

	constructor(
		/** A frame's document address and the making it is on now. */
		private readonly source: (name: string) => { src: string; revision: string },
	) {}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	/** One frame's documents, or undefined when it is not live. */
	entry(name: string): FieldEntry | undefined {
		return this.entries.get(name);
	}

	/** The frames live now. */
	get live(): ReadonlySet<string> {
		return new Set(this.order);
	}

	/** Frames whose document failed and which have not been made again since. */
	get failed(): ReadonlySet<string> {
		const failed = new Set<string>();
		for (const [name, revision] of this.failures) if (this.source(name).revision === revision) failed.add(name);
		return failed;
	}

	/** Whether any document is booting, which the picture layer's other stills wait out. */
	get booting(): boolean {
		for (const documents of this.mounted.values())
			if (documents.some((each) => each.phase !== "arrived")) return true;
		return false;
	}

	/** The frames that hold a document now, nearest the middle first (`chooseLive`). */
	setLive(order: readonly string[]): void {
		this.order = [...order];
		const keep = new Set(order);
		for (const name of [...this.mounted.keys()]) if (!keep.has(name)) this.unmount(name);
		this.pump();
		this.emit();
	}

	/** The camera started or stopped moving: arrived documents hold their animation while it moves. */
	setMoving(moving: boolean): void {
		if (moving === this.moving) return;
		this.moving = moving;
		clearTimeout(this.thaw);
		if (moving) this.freeze(true);
		else {
			this.thaw = setTimeout(() => this.freeze(false), MOVE_HOLD_MS);
			this.pump();
			this.emit();
		}
	}

	/** Every live frame's making may have changed: those made again boot their new document behind the old. */
	refresh(): void {
		this.pump();
		this.emit();
	}

	/** A shell's iframe for one document, mounted or gone. */
	attach(name: string, revision: string, iframe: HTMLIFrameElement | null): void {
		const document = this.mounted.get(name)?.find((each) => each.revision === revision);
		if (document !== undefined) document.iframe = iframe;
	}

	/** Listen to the documents' reports, for as long as the canvas is open. */
	listen(): () => void {
		const heard = (event: MessageEvent) => {
			const message = parseFrameMessage(event.data);
			if (message === undefined || (message.spool !== "loaded" && message.spool !== "arrived")) return;
			const document = this.mounted
				.get(message.frame)
				?.find((each) => each.iframe !== null && each.iframe.contentWindow === event.source);
			if (document === undefined) return;
			if (message.spool === "loaded") this.loaded(message.frame, document);
			else this.arrived(message.frame, document);
		};
		window.addEventListener("message", heard);
		return () => window.removeEventListener("message", heard);
	}

	stop(): void {
		this.stopped = true;
		clearTimeout(this.thaw);
		for (const documents of this.mounted.values()) for (const each of documents) clearTimeout(each.timer);
	}

	/** Boot what the live frames want, nearest first, a few at a time, and never while the camera moves. */
	private pump(): void {
		if (this.moving || this.stopped) return;
		const booting = [...this.mounted.values()].filter((documents) =>
			documents.some((each) => each.phase !== "arrived"),
		).length;
		const ready = new Set<string>();
		for (const name of this.order) {
			const newest = this.mounted.get(name)?.at(-1);
			if (newest !== undefined && newest.revision === this.source(name).revision) ready.add(name);
		}
		const failed = this.failed;
		const order = this.order.filter((name) => !failed.has(name));
		for (const name of nextBoots(order, ready, booting, BOOTS_AT_ONCE)) this.boot(name);
	}

	private boot(name: string): void {
		const { src, revision } = this.source(name);
		const documents = this.mounted.get(name) ?? [];
		// what is shown stays until the new one arrives; one that never arrived goes now
		const kept = documents.filter((each) => each.phase === "arrived").slice(-1);
		for (const each of documents) if (!kept.includes(each)) clearTimeout(each.timer);
		const document: Mounted = { revision, src, phase: "booting", iframe: null, timer: undefined };
		document.timer = setTimeout(() => this.fail(name, document), LOAD_DEADLINE_MS);
		this.mounted.set(name, [...kept, document]);
	}

	private loaded(name: string, document: Mounted): void {
		if (document.phase !== "booting") return;
		document.phase = "loaded";
		clearTimeout(document.timer);
		document.iframe?.contentWindow?.postMessage(arriveMessage(SETTLE_BUDGET_MS), "*");
		document.timer = setTimeout(() => this.arrived(name, document), ARRIVE_DEADLINE_MS);
		this.emit();
	}

	private arrived(name: string, document: Mounted): void {
		if (document.phase !== "loaded") return;
		document.phase = "arrived";
		clearTimeout(document.timer);
		// the newest arrived takes the place of every one before it
		const documents = this.mounted.get(name) ?? [];
		const at = documents.indexOf(document);
		for (const each of documents.slice(0, at)) clearTimeout(each.timer);
		this.mounted.set(name, documents.slice(at));
		if (this.held) document.iframe?.contentWindow?.postMessage(freezeMessage(true), "*");
		this.pump();
		this.emit();
	}

	/** A document that never reported loaded: let go, its frame back to its picture until it is made again. */
	private fail(name: string, document: Mounted): void {
		const documents = this.mounted.get(name);
		if (documents === undefined || !documents.includes(document)) return;
		this.failures.set(name, document.revision);
		const left = documents.filter((each) => each !== document);
		if (left.length > 0) this.mounted.set(name, left);
		else {
			// nothing of it to show: it is its picture again, and its place goes to the next frame waiting
			this.mounted.delete(name);
			this.order = this.order.filter((each) => each !== name);
		}
		this.pump();
		this.emit();
	}

	private unmount(name: string): void {
		for (const each of this.mounted.get(name) ?? []) clearTimeout(each.timer);
		this.mounted.delete(name);
	}

	private freeze(on: boolean): void {
		this.held = on;
		// one still arriving is let finish: a freeze would pause the entrance its settle waits out (#177)
		for (const documents of this.mounted.values())
			for (const each of documents)
				if (each.phase === "arrived") each.iframe?.contentWindow?.postMessage(freezeMessage(on), "*");
	}

	private emit(): void {
		const live = new Set(this.order);
		for (const name of [...this.entries.keys()]) if (!live.has(name)) this.entries.delete(name);
		for (const name of this.order) {
			const documents = this.mounted.get(name) ?? [];
			const newest = documents.at(-1);
			const was = this.entries.get(name);
			const next: FieldEntry = {
				documents: documents.map(({ revision, src, phase }) => ({ revision, src, phase })),
				shown: documents.some((each) => each.phase === "arrived"),
				loading:
					!this.failed.has(name) &&
					(newest === undefined || newest.phase !== "arrived" || newest.revision !== this.source(name).revision),
			};
			if (was === undefined || !sameEntry(was, next)) this.entries.set(name, next);
		}
		for (const listener of [...this.listeners]) listener();
	}
}

function sameEntry(a: FieldEntry, b: FieldEntry): boolean {
	return (
		a.shown === b.shown &&
		a.loading === b.loading &&
		a.documents.length === b.documents.length &&
		a.documents.every((each, i) => {
			const other = b.documents[i];
			return other !== undefined && each.revision === other.revision && each.phase === other.phase;
		})
	);
}
