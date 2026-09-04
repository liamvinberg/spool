import { type ReactNode, useState } from "react";
import { cn } from "shared/lib/utils";
import { Badge, Button, Dialog, PrototypeThemeContext } from "shared/ui/explore/components/reconsider/parts";
import { CanvasTools } from "shared/ui/spool/canvas-tools";
import { AgentIcon, ChevronIcon, FolderIcon, FrameIcon, PropertiesIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * Throwaway comparison for spool-cloud#29–32. Three separate canvas frames:
 * contextual editing, authored examples on an ordinary page, projected exports.
 * Changes are in memory. The source addresses and usage index are fixtures.
 * Shared primitives really propagate through one context; no source writer or
 * crop extraction is implemented. See docs/research/shared-library-second-pass.md.
 */
type Take = "context" | "examples" | "catalog";
type Place = "booking" | "system" | "library" | "account";
type Part = "Button" | "Dialog" | "Badge";
interface Snapshot {
	radius: number;
	accent: string;
	label: string;
}
const INITIAL: Snapshot = { radius: 8, accent: "#356653", label: "Pay 126 kr" };
const TAKES = {
	context: {
		title: "Edit where you are",
		note: "Shared editing and a list of uses. Every journey starts on a real frame.",
	},
	examples: {
		title: "A small page of primitives",
		note: "An ordinary page with chosen examples. The same components build the app.",
	},
	catalog: {
		title: "Every export gets a place",
		note: "The proposed automatic library. A preview shows one use, in one state.",
	},
} satisfies Record<Take, { title: string; note: string }>;
const FRAME_NAMES = ["checkout", "checkout--swish", "ticket", "account"];
const EXPORTS = [
	"Badge",
	"Button",
	"Dialog",
	"DialogBody",
	"DialogTitle",
	"Field",
	"FieldLabel",
	"IconArrow",
	"IconBoat",
	"IconCheck",
	"IconClose",
	"IconTicket",
	"PayBar",
	"Stepper",
];

export function LibraryReconsiderPrototype({ take }: { take: Take }) {
	const [place, setPlace] = useState<Place>(
		take === "context" ? "booking" : take === "examples" ? "system" : "library",
	);
	const [held, setHeld] = useState<Part | null>("Button");
	const [values, setValues] = useState<Snapshot>(INITIAL);
	const [history, setHistory] = useState<Snapshot[]>([]);
	const [selectedFrame, setSelectedFrame] = useState("checkout");
	const [dialogOpen, setDialogOpen] = useState(true);
	const [filter, setFilter] = useState("");
	const [selectedExport, setSelectedExport] = useState("Button");
	const [showState, setShowState] = useState(false);
	const [lastWrite, setLastWrite] = useState("No changes yet.");
	const [returnPlace, setReturnPlace] = useState<Place>("booking");
	const [returnFrame, setReturnFrame] = useState("checkout");
	const count = take === "examples" ? 5 : 4;
	const change = (next: Partial<Snapshot>, source: string) => {
		setHistory([...history, values]);
		setValues({ ...values, ...next });
		setLastWrite(source);
	};
	const undo = () => {
		const previous = history.at(-1);
		if (!previous) return;
		setValues(previous);
		setHistory(history.slice(0, -1));
		setLastWrite("Restored the previous change.");
	};
	const visit = (name: string) => {
		setPlace(name === "account" ? "account" : name === "system/primitives" ? "system" : "booking");
		setSelectedFrame(name);
	};
	const openExamples = () => {
		setReturnPlace(place);
		setReturnFrame(selectedFrame);
		setPlace(take === "examples" ? "system" : "library");
	};
	const pick = (part: Part) => {
		setHeld(part);
		setSelectedExport(part);
	};
	const rows = [...FRAME_NAMES, ...(take === "examples" ? ["system/primitives"] : [])];
	const uses =
		held === "Button"
			? rows
			: held === "Badge"
				? ["ticket", "account", ...(take === "examples" ? ["system/primitives"] : [])]
				: ["account", ...(take === "examples" ? ["system/primitives"] : [])];
	const rail = (
		<div className="flex h-full flex-col overflow-y-auto font-mono text-sm">
			<div className="border-b border-border px-4 py-3 text-base">Properties</div>
			{held === null ? (
				<p className="p-4 text-muted">Select a component.</p>
			) : (
				<>
					<div className="border-b border-border p-4">
						<div className="mb-2 text-muted">
							{place === "system" ? "primitives" : place === "library" ? "library" : selectedFrame}{" "}
							<span className="px-1">/</span> <span className="text-text">{held}</span>
						</div>
						<div className="text-[10px] text-muted">shared/ui/{held.toLowerCase()}.tsx:12</div>
						<div className="mt-3 text-xs">
							{held} · used in {uses.length} frames
						</div>
						{take !== "context" && place !== "system" && place !== "library" ? (
							<button type="button" onClick={openExamples} className="mt-3 text-xs text-thread hover:underline">
								{take === "examples" ? "View examples" : "Go to component"} ↗
							</button>
						) : null}
					</div>
					{held === "Button" ? (
						<div className="space-y-5 border-b border-border p-4">
							<div className="text-muted">Component</div>
							<label className="flex items-center justify-between">
								Corner radius{" "}
								<input
									aria-label="Corner radius"
									type="number"
									min="0"
									max="24"
									value={values.radius}
									onChange={(event) =>
										change(
											{ radius: Math.min(24, Math.max(0, Number(event.target.value))) },
											"Button radius changed in shared/ui/button.tsx.",
										)
									}
									className="w-14 rounded border border-border-raised bg-surface px-2 py-1 text-right"
								/>
							</label>
							<div className="text-[10px] text-muted">Changes Button in all {count} frames.</div>
						</div>
					) : (
						<div className="border-b border-border p-4 text-xs leading-5 text-muted">
							Select a Button to try a shared edit.{" "}
							{held === "Dialog"
								? "The example can also open and close."
								: "Its colour follows the same accent token."}
						</div>
					)}
					<div className="space-y-4 border-b border-border p-4">
						<div className="text-muted">Theme</div>
						<div className="flex items-center justify-between">
							<span>accent</span>
							<div className="flex gap-2">
								{["#356653", "#405b8b", "#825343"].map((accent) => (
									<button
										key={accent}
										type="button"
										aria-label={`Accent ${accent}`}
										onClick={() => change({ accent }, "Accent changed in shared/tokens.css.")}
										className={cn(
											"h-5 w-5 rounded-sm border border-white/20",
											values.accent === accent && "outline outline-1 outline-offset-2 outline-text",
										)}
										style={{ background: accent }}
									/>
								))}
							</div>
						</div>
						<div className="text-[10px] text-muted">Button and Badge use this token.</div>
					</div>
					{place === "booking" && selectedFrame === "checkout" && held === "Button" ? (
						<div className="space-y-3 border-b border-border p-4">
							<label className="block text-muted" htmlFor="button-label">
								This instance
							</label>
							<input
								id="button-label"
								aria-label="Checkout label"
								value={values.label}
								onChange={(event) =>
									change({ label: event.target.value }, "Label changed in frames/booking/checkout/frame.tsx.")
								}
								className="w-full rounded border border-border-raised bg-surface p-2 text-xs"
							/>
							<div className="text-[10px] text-muted">Label · checkout only</div>
						</div>
					) : null}
					<div className="p-4">
						<div className="mb-2 text-muted">Used in</div>
						{uses.map((name) => (
							<button
								type="button"
								key={name}
								onClick={() => visit(name)}
								className="flex w-full items-center justify-between py-2 text-left text-xs hover:text-thread"
							>
								<span>{name}</span>
								<span className="text-muted">↗</span>
							</button>
						))}
					</div>
				</>
			)}
			<div className="mt-auto border-t border-border p-4 text-[10px] leading-4 text-muted">{lastWrite}</div>
		</div>
	);
	return (
		<PrototypeThemeContext value={{ ...values, held, pick }}>
			<style>{`.prototype-hover { opacity: 0; } .prototype-part:hover .prototype-hover { opacity: 1; } .prototype-paper { background: #f7f5ef; color: #24312b; }`}</style>
			<div className="flex h-full flex-col bg-bg text-text">
				<div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
					<div>
						<h1 className="text-xl font-medium">{TAKES[take].title}</h1>
						<p className="mt-1 text-sm text-muted">{TAKES[take].note}</p>
					</div>
					<div className="flex items-center gap-4 font-mono text-xs text-muted">
						<span>prototype · edits stay here</span>
						<button
							type="button"
							onClick={undo}
							disabled={history.length === 0}
							className="hover:text-text disabled:opacity-30"
						>
							Undo
						</button>
						<button
							type="button"
							onClick={() => {
								setValues(INITIAL);
								setHistory([]);
								setLastWrite("No changes yet.");
							}}
							className="hover:text-text"
						>
							Reset
						</button>
					</div>
				</div>
				<div className="min-h-0 flex-1">
					<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom="100%">
						<div className="flex h-full overflow-hidden bg-canvas">
							<aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-bg">
								<div className="h-11 border-b border-border px-4 py-3 text-base font-medium">Pages</div>
								<div className="pt-3">
									<PageButton
										name="booking"
										active={place === "booking"}
										onClick={() => setPlace("booking")}
									/>
									{FRAME_NAMES.slice(0, 3).map((name) => (
										<FrameButton
											key={name}
											name={name}
											held={uses.includes(name)}
											active={place === "booking" && selectedFrame === name}
											onClick={() => visit(name)}
										/>
									))}
									<PageButton
										name="account"
										active={place === "account"}
										dot={held !== null}
										onClick={() => visit("account")}
									/>
								</div>
								{take === "examples" ? (
									<div className="mt-4">
										<PageButton
											name="system"
											active={place === "system"}
											onClick={() => setPlace("system")}
										/>
										<FrameButton
											name="primitives"
											held={held !== null}
											active={place === "system"}
											onClick={() => setPlace("system")}
										/>
									</div>
								) : null}
								{take === "catalog" ? (
									<div className="mt-auto border-t border-border py-3">
										<PageButton
											name="library"
											active={place === "library"}
											dot={held !== null}
											onClick={() => setPlace("library")}
										/>
									</div>
								) : null}
							</aside>
							<div className="relative min-w-0 flex-1 overflow-auto">
								{place === "booking" || place === "account" ? (
									<div className="min-h-full px-7 py-7">
										<div className="mb-7 flex items-center justify-between font-mono text-xs text-muted">
											<span>{place}</span>
											<button type="button" onClick={() => setHeld(null)} className="hover:text-text">
												Clear selection
											</button>
										</div>
										{place === "booking" ? (
											<div className="grid grid-cols-3 gap-5">
												{FRAME_NAMES.slice(0, 3).map((name) => (
													<div key={name}>
														<button
															type="button"
															onClick={() => visit(name)}
															className={cn(
																"mb-3 font-mono text-[10px]",
																selectedFrame === name ? "text-text" : "text-muted",
															)}
														>
															{name}
														</button>
														<ProductFrame
															name={name}
															label={values.label}
															selected={selectedFrame === name}
															onSelect={() => setSelectedFrame(name)}
														/>
													</div>
												))}
											</div>
										) : (
											<div className="mx-auto max-w-[300px]">
												<ProductFrame name="account" label={values.label} selected onSelect={() => {}} />
											</div>
										)}
										<p className="mt-8 max-w-[400px] text-sm leading-5 text-muted">
											Select a button, change its corner radius, then visit another frame. The label field
											changes only checkout.
										</p>
									</div>
								) : (
									<div className="px-8 py-6">
										<div className="mb-6 flex items-center justify-between font-mono text-xs text-muted">
											<span>{place === "system" ? "system / primitives" : "library / shared/ui"}</span>
											<button
												type="button"
												onClick={() => {
													setPlace(returnPlace);
													setSelectedFrame(returnFrame);
												}}
												className="hover:text-text"
											>
												← Return to {returnFrame}
											</button>
										</div>
										{place === "system" ? (
											<div className="space-y-7 pb-20">
												<div>
													<h2 className="text-2xl font-medium">Tvärsö, in pieces.</h2>
													<p className="mt-2 max-w-[480px] text-sm leading-5 text-muted">
														The pieces we use, shown in the states we care about.
													</p>
												</div>
												<Example name="Button" file="shared/ui/button.tsx" onClick={() => pick("Button")}>
													<div className="flex flex-wrap gap-5">
														<Button>Pay 126 kr</Button>
														<Button variant="outline">Timetable</Button>
														<Button disabled>Unavailable</Button>
													</div>
												</Example>
												<Example name="Badge" file="shared/ui/badge.tsx" onClick={() => pick("Badge")}>
													<div className="flex gap-3">
														<Badge>6 places</Badge>
														<Badge>Confirmed</Badge>
													</div>
												</Example>
												<Example name="Dialog" file="shared/ui/dialog.tsx" onClick={() => pick("Dialog")}>
													<button
														type="button"
														onClick={() => {
															pick("Dialog");
															setDialogOpen(!dialogOpen);
														}}
														className="mb-5 text-xs underline"
													>
														{dialogOpen ? "Close example" : "Open example"}
													</button>
													<Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
													{!dialogOpen ? (
														<div className="text-sm text-[#69746b]">
															Closed. Use Open example to see it.
														</div>
													) : null}
												</Example>
											</div>
										) : (
											<div className="pb-20">
												<div className="mb-5 flex items-end justify-between">
													<div>
														<h2 className="text-2xl">14 exports</h2>
														<p className="mt-2 text-sm text-muted">
															One preview per component, taken from its first use.
														</p>
													</div>
													<input
														aria-label="Find component"
														placeholder="Find component"
														value={filter}
														onChange={(event) => setFilter(event.target.value)}
														className="w-40 rounded border border-border-raised bg-bg px-3 py-2 text-sm"
													/>
												</div>
												<div className="grid grid-cols-3 gap-x-5 gap-y-6">
													{EXPORTS.filter((name) => name.toLowerCase().includes(filter.toLowerCase())).map(
														(name) => (
															<div key={name}>
																<button
																	type="button"
																	onClick={() => {
																		setSelectedExport(name);
																		if (name === "Button" || name === "Dialog" || name === "Badge")
																			setHeld(name);
																		else setHeld(null);
																	}}
																	className={cn(
																		"mb-3 font-mono text-xs",
																		selectedExport === name ? "text-thread" : "text-muted",
																	)}
																>
																	{name}
																</button>
																<div
																	className={cn(
																		"prototype-paper flex min-h-[110px] items-center justify-center rounded-sm p-4",
																		selectedExport === name &&
																			"outline outline-1 outline-offset-4 outline-thread",
																	)}
																>
																	{name === "Button" ? (
																		<Button>{values.label}</Button>
																	) : name === "Badge" ? (
																		<Badge>Confirmed</Badge>
																	) : name === "Field" ? (
																		<div className="w-full rounded border border-[#d9d6cc] px-3 py-2 text-sm">
																			070 123 45 67
																		</div>
																	) : name === "FieldLabel" ? (
																		<span className="text-sm">Mobile number</span>
																	) : name === "PayBar" ? (
																		<div className="flex flex-col items-center gap-3">
																			<span className="text-sm">2 adults · 126 kr</span>
																			<Button>Pay 126 kr</Button>
																		</div>
																	) : (
																		<p className="text-[11px] leading-4 text-[#69746b]">
																			{name === "Dialog" || name.startsWith("Dialog") ? (
																				"Closed in account. No visible preview."
																			) : name === "Stepper" ? (
																				"No usage yet."
																			) : name.startsWith("Icon") ? (
																				<span className="text-xl">
																					{name === "IconClose"
																						? "×"
																						: name === "IconCheck"
																							? "✓"
																							: name === "IconBoat"
																								? "≋"
																								: "↗"}
																				</span>
																			) : (
																				"No visible preview."
																			)}
																		</p>
																	)}
																</div>
																<div className="mt-3 font-mono text-[10px] text-muted">
																	{name === "Stepper"
																		? "0 uses"
																		: name === "Button"
																			? "checkout"
																			: name.startsWith("Dialog")
																				? "account"
																				: "ticket"}
																</div>
															</div>
														),
													)}
												</div>
												{EXPORTS.filter((name) => name.toLowerCase().includes(filter.toLowerCase()))
													.length === 0 ? (
													<p className="py-10 text-muted">No matching components.</p>
												) : null}
											</div>
										)}
									</div>
								)}
								<CanvasTools tool="edit" />
							</div>
							<aside className="flex shrink-0 border-l border-border bg-bg">
								<div className="w-[280px]">{rail}</div>
								<div className="flex w-11 flex-col items-center gap-5 border-l border-border pt-4">
									<PropertiesIcon className="h-4 w-4 text-thread" />
									<AgentIcon className="h-4 w-4 text-muted" />
								</div>
							</aside>
						</div>
					</SpoolShell>
				</div>
				<div className="shrink-0 border-t border-border bg-bg px-6 py-3 font-mono text-[10px] text-muted">
					<div className="flex items-center justify-between">
						<span>Try: radius → accent → checkout label → another frame → undo</span>
						<button type="button" onClick={() => setShowState(!showState)} className="hover:text-text">
							{showState ? "Hide" : "Show"} prototype state
						</button>
					</div>
					{showState ? (
						<pre className="mt-3 whitespace-pre-wrap">
							{JSON.stringify(
								{
									take,
									place,
									held,
									selectedFrame,
									...values,
									undoEntries: history.length,
									dialogOpen,
									filter,
									selectedExport,
								},
								null,
								2,
							)}
						</pre>
					) : null}
				</div>
			</div>
		</PrototypeThemeContext>
	);
}

function PageButton({
	name,
	active,
	dot = false,
	onClick,
}: {
	name: string;
	active: boolean;
	dot?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-8 w-full items-center gap-2 px-3 text-left font-mono text-sm",
				active ? "border-l-2 border-thread bg-surface text-text" : "text-muted hover:text-text",
			)}
		>
			<ChevronIcon open={name === "booking" || name === "system"} className="h-2.5 w-2.5" />
			<FolderIcon className="h-3.5 w-3.5" />
			<span className="flex-1">{name}</span>
			{dot ? <span className="h-1 w-1 rounded-full bg-thread" /> : null}
		</button>
	);
}

function FrameButton({
	name,
	held,
	active,
	onClick,
}: {
	name: string;
	held: boolean;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-7 w-full items-center gap-2 pr-4 pl-9 text-left font-mono text-[11px]",
				active ? "bg-surface text-text" : "text-muted hover:text-text",
			)}
		>
			<FrameIcon className="h-3 w-3" />
			<span className="flex-1">{name}</span>
			{held ? <span className="h-1 w-1 rounded-full bg-thread" /> : null}
		</button>
	);
}

function Example({
	name,
	file,
	onClick,
	children,
}: {
	name: string;
	file: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<section>
			<div className="mb-3 flex items-baseline justify-between">
				<button type="button" onClick={onClick} className="text-base hover:text-thread">
					{name}
				</button>
				<span className="font-mono text-[10px] text-muted">{file}</span>
			</div>
			<div className="prototype-paper rounded-sm p-7">{children}</div>
		</section>
	);
}

function ProductFrame({
	name,
	label,
	selected,
	onSelect,
}: {
	name: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div
			className={cn(
				"prototype-paper relative min-h-[370px] overflow-hidden rounded-sm p-5",
				selected && "outline outline-1 outline-offset-4 outline-border-raised",
			)}
			onPointerDown={onSelect}
		>
			<div className="flex items-center justify-between border-b border-[#ddd9cf] pb-4">
				<span className="text-xl font-semibold tracking-tight">Tvärsö</span>
				<span className="text-lg">≋</span>
			</div>
			<div className="pt-8 pb-5">
				<h2 className="text-[22px] leading-tight">
					{name === "ticket"
						? "See you on board."
						: name === "account"
							? "Your journeys."
							: "A little further out."}
				</h2>
				<p className="mt-3 text-xs leading-5 text-[#69746b]">
					Stockholm → Ramsö
					<br />
					Saturday, 14 June · 10:30
				</p>
			</div>
			{name === "ticket" || name === "account" ? (
				<div className="mb-5">
					<Badge>Confirmed</Badge>
				</div>
			) : (
				<div className="mb-8 flex justify-between border-y border-[#ddd9cf] py-3 text-xs">
					<span>2 adults</span>
					<span>126 kr</span>
				</div>
			)}
			<Button
				onClick={() => {
					if (name === "account") setOpen(true);
				}}
			>
				{name === "checkout"
					? label
					: name === "checkout--swish"
						? "Pay with Swish"
						: name === "ticket"
							? "Show ticket"
							: "Change departure"}
			</Button>
			{name === "account" && open ? (
				<div className="absolute inset-0 flex items-center justify-center bg-black/20 p-2">
					<Dialog open onClose={() => setOpen(false)} />
				</div>
			) : null}
		</div>
	);
}
