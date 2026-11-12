import type { At } from "./stage-session";
import type { SlideReadiness, StageShown } from "./stage-wire";

/**
 * A rehearsal (spool#322): a deck's talk played from its first beat to its last and back in the real stage, in the
 * photo booth's browser, for an agent to hear what broke, what moved wrong and what lagged, and to see it. These are
 * what it observes, as the stage's two documents and the driver record them (`runtime/frame-shim/rehearse-probes.ts`,
 * `daemon/deck/rehearse.ts`): the rules (`rehearse-rules.ts`) read nothing else.
 */

/** The verb, named in one place: the CLI, the skill and every line that tells an agent to run it again. */
export const REHEARSE = "rehearse";

/** A box on the slide, in the slide's own CSS px from its top left. */
export interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

/**
 * Words on the slide at rest that reach past one of its edges: each of their lines past it, where it is drawn, and
 * the box the slide's own clipping leaves them (null when nothing inside the slide clips them).
 */
export interface WordsAtEdge {
	readonly text: string;
	/** `path:line:column` under design/ of the element holding them, when the compiler stamped one */
	readonly source?: string;
	/** their computed font size, in the slide's px */
	readonly size: number;
	/** they, or something they are in, run an animation that never ends: they move on their own */
	readonly moving: boolean;
	readonly lines: readonly Box[];
	readonly clip: Box | null;
}

/** An element of the slide on one beat, laid out: where layout put it, transforms left out. */
export interface LaidOut {
	/** the same element on every beat of one rendering */
	readonly id: number;
	/** what it is, for a person: its tag, and its id or first class */
	readonly tag: string;
	readonly source?: string;
	/** its parent's id, when the parent is in the slide */
	readonly parent?: number;
	/** it has a box at all */
	readonly shown: boolean;
	/** it, or something it is in, runs an animation that never ends: it moves on its own */
	readonly moving: boolean;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** An element the slide draws that carries a `view-transition-name`. */
export interface NamedElement {
	readonly name: string;
	readonly tag: string;
	readonly source?: string;
}

/** A picture or a face the slide shows that came after the slide went on screen. */
export interface LateFile {
	readonly kind: "picture" | "font";
	/** the picture's address, or the face's family */
	readonly name: string;
	/** how long after the slide was shown it came, in ms */
	readonly after: number;
}

/** The slide on screen once a step came to rest, as the stage document read it. */
export interface RestLook {
	readonly frame: string;
	readonly words: readonly WordsAtEdge[];
	readonly layout: readonly LaidOut[];
	readonly names: readonly NamedElement[];
	/** WebGL contexts its canvases hold */
	readonly webgl: number;
	readonly late: readonly LateFile[];
}

/** One `startViewTransition` the stage made, as the stage document saw it. */
export interface MoveRecord {
	/** when it was asked for, epoch ms */
	readonly at: number;
	/** the slide on screen before, and after its update */
	readonly from: string | null;
	readonly to: string | null;
	/** when its animation began, epoch ms */
	readonly ready?: number;
	/** why it never began, as the browser said it */
	readonly failed?: string;
	readonly finished?: number;
	/** how long its own animations run, in ms */
	readonly runs?: number;
	/** the rehearsal held it still to picture it: its length says nothing */
	readonly held?: boolean;
}

/** What one slide was doing while it came on, the census the booth takes of a frame it times (spool#318). */
export interface StepCensus {
	readonly frame: string;
	/** `daemon/thumbs.ts`'s FrameCensus, as the stage document counted it in the slide alone */
	readonly census: unknown;
}

export type Pass = "forward" | "back";

/** One key and what came of it. */
export interface StepRecord {
	readonly pass: Pass;
	readonly from: At;
	readonly to: At;
	/** when the key went down, epoch ms */
	readonly key: number;
	/** how long the slide it went to was still loading before the key, ms, when the rehearsal stopped waiting for it */
	readonly loading?: number;
	/** when the stage said the change was on screen, epoch ms; absent when it never said */
	readonly shownAt?: number;
	readonly shown?: StageShown;
	/** when the slide came to rest, epoch ms */
	readonly rest: number;
	/** every frame the stage document drew from the key to rest, epoch ms */
	readonly frames: readonly number[];
	/** the move between slides this key made, when it made one */
	readonly move?: MoveRecord;
	readonly census?: StepCensus;
	/** the slides' readiness as the stage said it last, once the step was over */
	readonly slides?: readonly SlideReadiness[];
}

/** A key the rehearsal pressed, a step's or a move's played again, and where it took the talk. */
export interface Visit {
	/** when the key went, epoch ms */
	readonly at: number;
	readonly to: At;
	readonly pass: Pass;
}

/** A beat at rest on the way forward: what it looked like, and its picture. */
export interface BeatAtRest {
	readonly at: At;
	readonly look: RestLook;
	/** when the beat was shown, epoch ms */
	readonly shownAt: number;
	/** the slide called requestAnimationFrame on and on once it rested: a loop of its own */
	readonly loop: boolean;
	/** its picture's file name */
	readonly still: string;
}

/** What the browser said while the talk played, and when, epoch ms. */
export interface ConsoleLine {
	readonly text: string;
	readonly at: number;
}

/** A request of the talk's that failed. */
export interface FailedRequest {
	readonly url: string;
	/** the status it answered, or why it never answered */
	readonly status: number | string;
	readonly at: number;
}

/** The pictures of one move between slides, from inside it. */
export interface MoveStills {
	/** the slide it leaves, by its place from 0 */
	readonly from: number;
	/** how long the move runs, ms; 0 when nothing moved */
	readonly runs: number;
	/** start, middle and end; one when nothing moved */
	readonly stills: readonly { readonly label: "start" | "middle" | "end" | "cut"; readonly still: string }[];
}

/** Whether this machine can tell a slide's lag from its own. */
export interface Machine {
	/** the browser draws in software: every slide would look slow */
	readonly software: boolean;
	/** load average over the last minute, and the cores it is shared by */
	readonly load: number;
	readonly cores: number;
	/** an empty page's frames over half a second, epoch ms: a busy machine misses some of these too */
	readonly idle: readonly number[];
}

/** One slide of the talk as the rehearsal knows it. */
export interface RehearsedSlide {
	readonly frame: string;
	/** its beats' names, one at least */
	readonly beats: readonly string[];
}

/** A whole rehearsal, as the driver hands it to the rules. */
export interface Rehearsal {
	readonly page: string;
	readonly size: { readonly w: number; readonly h: number };
	readonly slides: readonly RehearsedSlide[];
	/** the slides rehearsed, by place from 0, both ends included */
	readonly from: number;
	readonly to: number;
	readonly machine: Machine;
	/** how long the talk took to show its first slide, ms; absent when it never did */
	readonly openMs?: number;
	readonly steps: readonly StepRecord[];
	/** every key in order, for what the talk said to be put where it was */
	readonly visits: readonly Visit[];
	readonly beats: readonly BeatAtRest[];
	readonly moves: readonly MoveStills[];
	readonly console: readonly ConsoleLine[];
	readonly requests: readonly FailedRequest[];
	/** why it stopped before the end, when it did */
	readonly stopped?: string;
	/** stage documents that connected: more than one is a save taking over while it played */
	readonly documents: number;
	/** how long the whole rehearsal took, in ms */
	readonly ms: number;
}
