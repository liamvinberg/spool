/** Where a talk is presented from: a deck page of a project, and the slide it starts on, by its path. */
export interface PresentFrom {
	readonly project: string;
	readonly page: string;
	readonly slide: string;
}

/**
 * Present a deck from one of its slides (spool#265): what a slide's play on its name label does. Presenting itself
 * is spool#270's (spool's window becomes the presenter view and the room opens as a second window), and it lands
 * here; until then this is the one call site, ready, and pressing play on a slide does nothing.
 */
export function presentDeck(_from: PresentFrom): void {}
