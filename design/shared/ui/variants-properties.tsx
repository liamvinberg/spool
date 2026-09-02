import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { type Decision, type Standing, useDecision } from "shared/lib/variants-decision";
import { cn } from "shared/lib/utils";
import { Scaled, TvarsoCheckout, TvarsoOutlet, TvarsoShell, type Variation } from "shared/ui/tvarso-checkout";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { BOX, FAINT, LABEL, Row, Section, VALUE } from "shared/ui/spool-properties-fields";
import { SpoolShell } from "shared/ui/spool-shell";
import { Argues } from "shared/ui/variants-shell";

/**
 * The variation set inside the rail spool is actually going to have.
 *
 * The sidebar this page has to plan for is `properties--rail`, not today's
 * inspector, so this is a copy of that rail with one thing added: when the
 * selection is a frame that holds a set, the rail grows a second tab, and that
 * tab is where the decision gets made. Select an element inside the frame
 * instead and the tab is not there at all — a paragraph has no variations, so
 * the strip disappears rather than sitting there greyed out.
 *
 * The tab is a decision, not a list. Every row is a candidate; keeping one
 * discards the rest and closes it; discarding one at a time narrows it; the
 * discarded stay in the rail, recoverable, because the rejected three are the
 * argument for the one that won. When one candidate is left the decision is
 * resolved however you got there, and the tab collapses to a record of what was
 * decided and when.
 *
 * The property sections under it are drawn from `properties--rail` for context
 * and are not wired here. What is live is the strip, the rows, and the acts.
 */

const PAGES: readonly PageRow[] = [
	{ name: "booking", frames: ["checkout", "timetable", "ticket"], active: true, open: true },
	{ name: "site", frames: ["landing", "pricing", "changelog", "docs"] },
];

type Held = "frame" | "payment";

export function VariantsPropertiesScreen({
	start = "open",
	name,
	argues,
}: {
	start?: Standing;
	name: string;
	argues: string;
}) {
	const decision = useDecision(start);
	const [held, setHeld] = useState<Held>("frame");
	const cardRef = useRef<HTMLDivElement | null>(null);
	const outletRef = useRef<HTMLDivElement | null>(null);
	const [box, setBox] = useState<{ top: number; height: number } | null>(null);

	useLayoutEffect(() => {
		const outer = cardRef.current;
		const inner = outletRef.current;
		if (outer === null || inner === null) return;
		const a = outer.getBoundingClientRect();
		const b = inner.getBoundingClientRect();
		setBox({ top: b.top - a.top, height: b.height });
	}, [decision.showing.id]);

	const whole = decision.showing.id === "empty";

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso", "spool"]} zoom="100%">
			<CanvasChrome
				pages={PAGES}
				selected="checkout"
				tool="select"
				railLabel="properties"
				railWidth={300}
				rail={<DecideRail decision={decision} held={held} />}
			>
				<Argues name={name} argues={argues} />
				<Still left={26} top={210} name="timetable" />
				<Still left={690} top={168} name="ticket" />

				<div className="absolute flex flex-col gap-1.5" style={{ left: 268, top: 128 }}>
					<button
						type="button"
						onClick={() => setHeld("frame")}
						className="flex h-4 w-[360px] items-center gap-1.5 font-mono text-sm leading-4"
					>
						<span className={cn(held === "frame" ? "text-thread" : "text-muted")}>checkout</span>
						<span className="ml-auto font-mono text-2xs text-muted/55 leading-3">
							{decision.standing === "open" ? `${decision.candidates.length} candidates` : decision.showing.label}
						</span>
					</button>
					<div ref={cardRef} className="relative">
						{whole ? (
							<TvarsoCheckout variation="empty" />
						) : (
							<TvarsoShell outletRef={outletRef} action={actionOf(decision.showing)}>
								<AnimatePresence initial={false}>
									<motion.div
										key={decision.showing.id}
										className="absolute inset-x-6 top-4"
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -6 }}
										transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
									>
										<TvarsoOutlet variation={decision.showing.id as "card"} />
									</motion.div>
								</AnimatePresence>
							</TvarsoShell>
						)}
						{/* the element inside the frame, which is what makes the strip come and go */}
						{whole ? null : (
							<button
								type="button"
								aria-label="Select the payment block"
								onClick={(event) => {
									event.stopPropagation();
									setHeld("payment");
								}}
								className="absolute inset-x-0"
								style={{ top: box?.top ?? 300, height: box?.height ?? 208 }}
							/>
						)}
						{held === "frame" ? (
							<span className="pointer-events-none absolute -inset-[3px] rounded-[16px] border-[1.5px] border-thread" />
						) : (
							<span
								className="pointer-events-none absolute inset-x-[-2px] rounded-[4px] border-[1.5px] border-thread"
								style={{ top: (box?.top ?? 300) - 2, height: (box?.height ?? 208) + 4 }}
							/>
						)}
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

function actionOf(variation: Variation): string {
	if (variation.id === "swish") return "Pay with Swish";
	if (variation.id === "invoice") return "Send the invoice";
	if (variation.id === "voucher") return "Pay 46 kr";
	return "Pay 126 kr";
}

/* ── the rail ──────────────────────────────────────────────────────────── */

type Tab = "properties" | "variations";

function DecideRail({ decision, held }: { decision: Decision; held: Held }) {
	const [tab, setTab] = useState<Tab>("variations");
	// an element has no variations, so the strip is not drawn and the rail is
	// what it always was
	const hasSet = held === "frame";
	const showing = hasSet ? tab : "properties";

	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="shrink-0 border-border border-b">
				<div className="flex h-9 items-center gap-2 px-2.5">
					<span className={cn("flex min-w-0 items-center gap-1 truncate", VALUE)}>
						<button type="button" className={cn("rounded-xs px-0.5", held === "frame" ? "text-thread" : "text-muted")}>
							checkout
						</button>
						{held === "frame" ? null : (
							<>
								<span className="text-muted/30">/</span>
								<span className="px-0.5 text-thread">payment</span>
							</>
						)}
					</span>
					<span className={cn("ml-auto shrink-0", FAINT)}>{held === "frame" ? "frame" : "div"}</span>
				</div>
			</div>

			{hasSet ? <Strip tab={tab} onTab={setTab} decision={decision} /> : null}

			<div className="min-h-0 flex-1 overflow-y-auto [&>div:first-child]:border-t-0">
				{showing === "variations" ? <VariationsTab decision={decision} /> : <PropertiesTab held={held} />}
			</div>
		</div>
	);
}

/**
 * The strip, which is only ever two tabs and only ever appears on a frame that
 * holds a set. An open decision carries its count; a resolved one carries a
 * dot, because the number that matters is no longer how many there are.
 */
function Strip({ tab, onTab, decision }: { tab: Tab; onTab: (tab: Tab) => void; decision: Decision }) {
	return (
		<div className="flex h-8 shrink-0 items-stretch gap-4 border-border border-b px-2.5">
			{(["properties", "variations"] as const).map((candidate) => {
				const on = candidate === tab;
				return (
					<button
						key={candidate}
						type="button"
						aria-pressed={on}
						onClick={() => onTab(candidate)}
						className={cn(
							"relative flex items-center gap-1.5 font-mono text-xs leading-xs transition-colors",
							on ? "text-text" : "text-muted/60 hover:text-muted",
						)}
					>
						{candidate}
						{candidate === "variations" ? (
							decision.standing === "open" ? (
								<span className="font-mono text-2xs text-muted/60 leading-3">{decision.candidates.length}</span>
							) : (
								<span className="h-1 w-1 rounded-full bg-muted/50" />
							)
						) : null}
						{on ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
					</button>
				);
			})}
		</div>
	);
}

function VariationsTab({ decision }: { decision: Decision }) {
	const open = decision.standing === "open";
	return (
		<div className="flex flex-col">
			<div className="flex h-6 items-center gap-2 border-border-raised border-t px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{open ? "candidates" : "decided"}</span>
				<span className={cn("ml-auto shrink-0", FAINT)}>
					{open ? `${decision.candidates.length} in the running` : `${decision.at} · ${decision.kept?.label ?? ""}`}
				</span>
			</div>

			<AnimatePresence initial={false}>
				{decision.candidates.map((variation) => (
					<CandidateRow
						key={variation.id}
						variation={variation}
						showing={variation.id === decision.showing.id}
						kept={!open}
						alone={decision.candidates.length === 1}
						onLook={() => decision.look(variation.id)}
						onKeep={() => decision.keep(variation.id)}
						onDiscard={() => decision.discard(variation.id)}
					/>
				))}
			</AnimatePresence>

			{decision.discarded.length === 0 ? null : (
				<>
					<div className="flex h-6 items-center gap-2 border-border-raised border-t px-2.5">
						<span className={cn("shrink-0 text-muted/70", LABEL)}>discarded</span>
						<span className={cn("ml-auto shrink-0", FAINT)}>{decision.discarded.length}</span>
					</div>
					<AnimatePresence initial={false}>
						{decision.discarded.map((variation) => (
							<motion.div
								key={variation.id}
								layout
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="group flex h-7 items-center gap-2 border-border/80 border-b px-2.5"
							>
								<span className={cn("min-w-0 flex-1 truncate text-muted/45 line-through", VALUE)}>
									{variation.label}
								</span>
								<button
									type="button"
									onClick={() => decision.restore(variation.id)}
									className={cn("shrink-0 text-muted/40 transition-colors hover:text-text", LABEL)}
								>
									restore
								</button>
							</motion.div>
						))}
					</AnimatePresence>
				</>
			)}

			<div className="flex flex-col gap-2 border-border-raised border-t px-2.5 py-2.5">
				{open ? (
					<span className={cn("leading-4", FAINT)}>Keeping one discards the rest. Nothing leaves the rail until you close it.</span>
				) : (
					<>
						<span className={cn("leading-4", FAINT)}>
							{decision.discarded.length} moved to the Trash. The rail keeps the record until the decision is closed.
						</span>
						<button
							type="button"
							onClick={decision.reopen}
							className={cn(
								"flex h-6 w-fit items-center rounded-xs border border-border-raised px-2 text-muted transition-colors hover:border-thread hover:text-text",
								LABEL,
							)}
						>
							reopen the decision
						</button>
					</>
				)}
			</div>
		</div>
	);
}

function CandidateRow({
	variation,
	showing,
	kept,
	alone,
	onLook,
	onKeep,
	onDiscard,
}: {
	variation: Variation;
	showing: boolean;
	kept: boolean;
	alone: boolean;
	onLook: () => void;
	onKeep: () => void;
	onDiscard: () => void;
}) {
	// the acts sit on the row you are looking at, so the rail always shows what can
	// be done with a candidate rather than hiding both verbs behind a hover
	return (
		<motion.div
			layout
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0, x: 12 }}
			transition={{ type: "spring", stiffness: 420, damping: 38 }}
			className={cn(
				"group relative flex h-14 items-center gap-2.5 border-border/80 border-b px-2.5",
				showing ? "bg-surface" : "hover:bg-surface/60",
			)}
		>
			{showing ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<button type="button" onClick={onLook} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
				<span
					className={cn(
						"flex shrink-0 overflow-hidden rounded-[3px] border",
						showing ? "border-thread" : "border-border-raised",
					)}
				>
					<Scaled scale={0.075}>
						<TvarsoCheckout variation={variation.id} />
					</Scaled>
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					<span className={cn("truncate", VALUE, showing ? "text-text" : "text-muted")}>{variation.label}</span>
					<span className={cn("truncate", FAINT)}>{kept ? "kept" : variation.note}</span>
				</span>
			</button>
			{kept ? (
				<span className={cn("shrink-0 text-thread", LABEL)}>kept</span>
			) : (
				<span
					className={cn(
						"flex shrink-0 items-center gap-1 transition",
						showing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					)}
				>
					<button
						type="button"
						onClick={onKeep}
						title="keep this one and discard the rest"
						className={cn(
							"h-5 rounded-xs border border-border-raised px-1.5 text-muted transition-colors hover:border-thread hover:text-text",
							LABEL,
						)}
					>
						keep
					</button>
					{alone ? null : (
						<button
							type="button"
							aria-label={`discard ${variation.label}`}
							onClick={onDiscard}
							className="flex h-5 w-5 items-center justify-center rounded-xs text-muted/50 transition-colors hover:bg-surface hover:text-text"
						>
							<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
								<path d="m2.4 2.4 5.2 5.2m0-5.2-5.2 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
							</svg>
						</button>
					)}
				</span>
			)}
		</motion.div>
	);
}

/* ── the rail as it already is, for context ────────────────────────────── */

function Val({ children, faint = false }: { children: ReactNode; faint?: boolean }) {
	return (
		<span className={cn("flex h-5 min-w-0 flex-1 items-center px-1.5", BOX, VALUE, faint ? "text-muted/55" : "text-text")}>
			{children}
		</span>
	);
}

function PropertiesTab({ held }: { held: Held }) {
	const frame = held === "frame";
	return (
		<>
			<Section name="position">
				<Row name="x">
					<Val>{frame ? "1740" : "24"}</Val>
				</Row>
				<Row name="y">
					<Val>{frame ? "96" : "352"}</Val>
				</Row>
			</Section>
			<Section name="size">
				<Row name="width">
					<Val>{frame ? "360" : "312"}</Val>
				</Row>
				<Row name="height">
					<Val>{frame ? "620" : "208"}</Val>
				</Row>
			</Section>
			<Section name="layout">
				<Row name="display">
					<Val>flex</Val>
				</Row>
				<Row name="gap">
					<Val>{frame ? "0" : "12"}</Val>
				</Row>
			</Section>
			<Section name="appearance">
				<Row name="border-radius">
					<Val>{frame ? "14" : "8"}</Val>
				</Row>
				<Row name="background-color">
					<Val>
						<span className="mr-1.5 h-3 w-3 shrink-0 rounded-[2px] border border-border-raised bg-[#FBFBF9]" />
						paper
					</Val>
				</Row>
			</Section>
			<Section name="source">
				<Row name="className" tall>
					<Val faint>{frame ? "flex flex-col rounded-[14px]" : "flex h-52 flex-col px-6 pt-4"}</Val>
				</Row>
			</Section>
		</>
	);
}

/** a neighbour on the field, drawn as the properties surface draws one */
function Still({ left, top, name }: { left: number; top: number; name: string }) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<span className="font-mono text-muted text-sm leading-4">{name}</span>
			<div className="h-[380px] w-[196px] overflow-hidden rounded-[8px] border border-border bg-bg">
				<div className="flex h-full flex-col gap-2 p-3">
					<span className="h-3 w-14 rounded-full bg-surface" />
					<span className="h-20 w-full rounded-[4px] bg-surface" />
					<span className="h-1.5 w-[88%] rounded-full bg-raised" />
					<span className="h-1.5 w-[72%] rounded-full bg-raised" />
					<span className="h-1.5 w-[80%] rounded-full bg-raised" />
					<span className="mt-auto h-7 w-full rounded-[4px] bg-raised" />
				</div>
			</div>
		</div>
	);
}
