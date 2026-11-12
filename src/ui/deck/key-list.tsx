import { Kbd } from "../primitives/display";
import { Scrim, Sheet } from "../primitives/overlays";

/** One group of the key list: its name and its rows, each a label and the key faces that do it. */
interface KeyGroup {
	readonly group: string;
	readonly rows: readonly { readonly label: string; readonly keys: readonly string[] }[];
}

/**
 * Where the list is asked for: the presenter view, beside a room; the slides filling the screen, which is the room's;
 * or a slide gone into on the canvas, with none.
 */
export type KeyListPlace =
	| { readonly at: "presenter"; readonly swaps: boolean }
	/** `room`: a room on another display is shown the presenter's pointer */
	| { readonly at: "filling"; readonly room: boolean }
	| { readonly at: "inside" };

/**
 * The keys of a talk as ? lists them (spool#265). In the presenter view, the room's own keys, with X when the Mac app
 * has a second screen for the room to trade with spool's window. With the slides filling the screen (spool#298) that
 * screen is the room's, which B blacks, with nothing apart to freeze or swap. Show pointer is L wherever a room on
 * another screen is sent the presenter's pointer (spool#315). In place on the canvas there is no room,
 * so no room's keys, and Esc comes out of the slide rather than ending a talk.
 */
export function keyGroups(place: KeyListPlace): readonly KeyGroup[] {
	const room: KeyGroup = {
		group: "room",
		rows: [
			{ label: "Black screen", keys: ["B", "."] },
			...(place.at === "presenter" ? [{ label: "Freeze, then catch up", keys: ["F"] }] : []),
			...(place.at === "presenter" && place.swaps ? [{ label: "Swap screens", keys: ["X"] }] : []),
			...(place.at === "presenter" || (place.at === "filling" && place.room)
				? [{ label: "Show pointer", keys: ["L"] }]
				: []),
		],
	};
	return [
		{
			group: "move",
			rows: [
				{ label: "Next", keys: ["→", "space", "↵", "N"] },
				{ label: "Back", keys: ["←", "P", "⌫"] },
				{ label: "Next slide, its beats skipped", keys: ["⇧→"] },
				{ label: "Previous slide", keys: ["⇧←"] },
			],
		},
		{
			group: "jump",
			rows: [
				{ label: "First slide", keys: ["home"] },
				{ label: "Last slide", keys: ["end"] },
				{ label: "Slide by number", keys: ["3", "↵"] },
				{ label: place.at === "inside" ? "Leave the slide" : "End the talk", keys: ["esc"] },
			],
		},
		...(place.at === "inside" ? [] : [room]),
		{
			group: "live slide",
			rows: [
				{ label: "Give it the keys", keys: ["⇥"] },
				{ label: "Take them back", keys: ["esc"] },
				{ label: "Restart the slide", keys: ["R"] },
			],
		},
	];
}

/** ? while a talk plays: its keys, in spool's own sheet over what holds it; esc or ? puts it away. */
export function KeyList({ place, onClose }: { place: KeyListPlace; onClose: () => void }) {
	return (
		<>
			<Scrim label="Close the key list" onMouseDown={onClose} />
			<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-8">
				<Sheet
					aria-label="Presenting keys"
					title="Presenting keys"
					hint="esc closes"
					className="pointer-events-auto max-h-[calc(100%-128px)]"
				>
					<div className="columns-2 gap-x-12">
						{keyGroups(place).map(({ group, rows }) => (
							<section key={group} className="mb-5 break-inside-avoid">
								<h3 className="mb-1.5 text-secondary type-label">{group}</h3>
								{rows.map((row) => (
									<div key={row.label} className="flex h-7 items-center justify-between gap-4">
										<span className="truncate text-primary type-control">{row.label}</span>
										<span className="flex shrink-0 items-center gap-1.5">
											{row.keys.map((face) => (
												<Kbd key={face}>{face}</Kbd>
											))}
										</span>
									</div>
								))}
							</section>
						))}
					</div>
				</Sheet>
			</div>
		</>
	);
}
