import { type ReactNode, useEffect, useRef, useState } from "react";
import { CAPTURED, useModel } from "shared/lib/spool/agent-model";
import { type Pointed, contextLine } from "shared/lib/spool/agent-selection";
import type { PlayEntry } from "shared/lib/spool/turn-play";
import { cn } from "shared/lib/utils";
import { CanvasTools } from "shared/ui/spool/canvas-tools";
import {
	AgentIcon,
	ChevronIcon,
	FolderIcon,
	FrameIcon,
	PanelCaret,
	PlusIcon,
	PropertiesIcon,
	ThreadIcon,
} from "shared/ui/spool/icons";
import { ModelMenu } from "shared/ui/spool/model-control";
import { COMPOSER_W, PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import { Choice } from "./choice";

export type AgentRequest = { id: number; text: string };
type Surface = "properties" | "agent";
const FRAMES = ["booking", "confirmation", "journal"];
const WIDTH = { properties: 300, agent: 420 };

// The current canvas-chrome and src/ui/canvas/dock presentation, with local
// selection and handoff state. The existing PlayRail owns the composer itself.
export function EditingShell({
	canvas,
	properties,
	diagnostics,
	request,
	initialAgent,
	selected,
	selectedName,
	onReveal,
	onDrop,
	zoom,
	onZoom,
	onFit,
}: {
	canvas: ReactNode;
	properties: ReactNode;
	diagnostics: ReactNode;
	request: AgentRequest | null;
	initialAgent: boolean;
	selected: HTMLElement | null;
	selectedName: string;
	onReveal: (frame: string) => void;
	onDrop: () => void;
	zoom: number;
	onZoom: (factor: number) => void;
	onFit: () => void;
}) {
	const [surface, setSurface] = useState<Surface | null>(initialAgent ? "agent" : "properties");
	const [leaving, setLeaving] = useState<Surface | null>(null);
	const previous = useRef(surface);
	const host = useRef<HTMLDivElement>(null);
	const [arrowsOn, setArrowsOn] = useState(true);
	const [pagesOpen, setPagesOpen] = useState(true);
	const [pageOpen, setPageOpen] = useState(true);
	const [draft, setDraft] = useState("");
	const [entries, setEntries] = useState<PlayEntry[]>([]);
	const model = useModel(CAPTURED, 0);
	const frame = selected?.closest<HTMLElement>("[data-frame-shell]")?.dataset.frameShell;
	const selection: Pointed[] =
		selected && frame
			? [
					{
						id: selected.dataset.editNode ?? frame,
						kind: "element",
						frame,
						name: selectedName,
						path:
							selected.dataset.owner ??
							selected.closest<HTMLElement>("[data-owner]")?.dataset.owner ??
							`frames/${frame}/frame.tsx`,
						// Authored source identity, like the rest of the fixed editing fixture.
						lines: selected.dataset.shared ? [12, 34] : [40, 62],
						selector: `[data-edit-node="${selected.dataset.editNode}"]`,
						excerpt: selected.outerHTML.slice(0, 240),
					},
				]
			: [];
	useEffect(() => {
		const last = previous.current;
		previous.current = surface;
		if (last === surface) return;
		setLeaving(last);
		const timer = window.setTimeout(() => setLeaving(null), surface && last ? 160 : 320);
		return () => window.clearTimeout(timer);
	}, [surface]);
	useEffect(() => {
		if (!request) return;
		setSurface("agent");
		if (request.text)
			setDraft((current) =>
				current.includes(request.text) ? current : [current, request.text].filter(Boolean).join("\n\n"),
			);
		// After the menu restores its trigger, focus the existing composer. The
		// request's id makes repeated requests focus it even with unchanged words.
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() =>
				host.current?.querySelector<HTMLTextAreaElement>("[data-agent-rail] textarea")?.focus({ preventScroll: true }),
			);
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	}, [request]);
	const agent = (
		<div data-agent-rail="" className="flex h-full min-h-0 flex-col">
			<PlayRail
				entries={entries}
				phase="idle"
				run={0}
				say="read"
				entered="plain"
				selection={selection}
				onDrop={onDrop}
				draft={draft}
				onDraft={setDraft}
				onSend={(text) =>
					setEntries((current) => [
						...current,
						{ key: String(current.length), kind: "user", text, context: contextLine(selection, COMPOSER_W, "plain") },
					])
				}
				onReplay={() => {}}
				model={<ModelMenu state={model.state} models={model.models} pin={model.pin} onPick={model.pick} />}
				afterLog={
					entries.length ? (
						<p className="px-3.5 pb-3 text-muted type-caption">Send simulated in this prototype.</p>
					) : undefined
				}
				nav={
					<div className="relative z-40 shrink-0 border-border border-b bg-bg">
						<div data-agent-plate="" className="flex h-11 items-center gap-1 px-3.5">
							<div className="min-w-0 flex-1">
								<Choice
									label="Chats"
									value="current"
									options={[{ value: "current", label: entries[0]?.kind === "user" ? entries[0].text : "New chat" }]}
									onChange={() => {}}
								/>
							</div>
							<button
								type="button"
								aria-label="New chat"
								onClick={() => {
									setEntries([]);
									setDraft("");
									host.current?.querySelector<HTMLTextAreaElement>("[data-agent-rail] textarea")?.focus();
								}}
								className="-mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-150 hover:text-text"
							>
								<PlusIcon className="h-3.5 w-3.5" />
							</button>
						</div>
						<div className="flex h-8 items-center justify-between px-3.5 pb-2">
							<span className="flex items-center gap-1.5 text-muted type-detail">
								Claude Code <ChevronIcon className="h-2 w-2" />
							</span>
							{!entries.length && <span className="text-muted/65 type-caption">For this new chat</span>}
						</div>
					</div>
				}
			/>
		</div>
	);
	return (
		<div ref={host} className="h-full">
			<SpoolShell
				activeTab="northbound"
				tabs={["northbound"]}
				canvasControls={false}
				headerAccessory={
					<div className="ei-shell-controls">
						<button
							type="button"
							aria-label="Threads"
							aria-pressed={arrowsOn}
							onClick={() => setArrowsOn(!arrowsOn)}
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded-sm hover:bg-surface",
								arrowsOn ? "text-text" : "text-muted",
							)}
						>
							<ThreadIcon className="h-3.5 w-3.5" />
						</button>
						<Choice
							label="Canvas zoom"
							value={String(zoom)}
							options={[
								{ value: "out", label: "Zoom out", detail: "−" },
								{ value: "in", label: "Zoom in", detail: "+" },
								{ value: "actual", label: "Actual size", detail: "⇧ 0" },
								{ value: "fit", label: "Zoom to selection", detail: "⇧ 2" },
							]}
							onChange={(next) =>
								next === "fit" ? onFit() : onZoom(next === "actual" ? 1 / zoom : next === "in" ? 1.25 : 0.8)
							}
						>
							<span>{Math.round(zoom * 100)}%</span>
						</Choice>
						{diagnostics}
					</div>
				}
			>
				<div className="flex h-full w-full overflow-hidden bg-bg">
					<aside
						aria-label="Pages"
						className="flex shrink-0 flex-col border-border border-r bg-bg"
						style={{ width: pagesOpen ? 248 : 44 }}
					>
						<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-2">
							{pagesOpen && (
								<div className="flex items-baseline gap-2 pl-1.5">
									<h1 className="font-semibold type-control">Pages</h1>
									<span className="text-muted type-value">1</span>
								</div>
							)}
							<button
								type="button"
								aria-label={pagesOpen ? "Collapse pages" : "Expand pages"}
								onClick={() => setPagesOpen(!pagesOpen)}
								className="flex h-7 w-7 items-center justify-center rounded-sm text-muted hover:bg-surface"
							>
								<PanelCaret dir={pagesOpen ? "left" : "right"} className="h-3.5 w-2.5" />
							</button>
						</div>
						{pagesOpen && (
							<div className="py-2">
								<button
									type="button"
									onClick={() => setPageOpen(!pageOpen)}
									aria-expanded={pageOpen}
									className="relative flex h-8 w-full items-center bg-surface pr-1.5 text-left"
								>
									<span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-thread" />
									<span className="flex h-8 w-6 items-center justify-center text-muted">
										<ChevronIcon open={pageOpen} className="h-2.5 w-2.5" />
									</span>
									<FolderIcon className="mr-2 h-3.5 w-3.5 text-thread" />
									<span className="flex-1 type-value">stays</span>
									<span className="text-muted type-detail">3</span>
								</button>
								{pageOpen && (
									<div className="relative pb-0.5">
										<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
										{FRAMES.map((candidate) => (
											<button
												type="button"
												key={candidate}
												onClick={() => onReveal(candidate)}
												className={cn(
													"relative flex h-7 w-full items-center gap-2 pl-[34px] text-left hover:bg-surface",
													frame === candidate && "bg-surface",
												)}
											>
												<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
												<FrameIcon className={cn("h-3.5 w-3.5", frame === candidate ? "text-thread" : "text-muted")} />
												<span className={cn("type-value", frame === candidate ? "text-text" : "text-muted")}>
													{candidate}
												</span>
											</button>
										))}
									</div>
								)}
							</div>
						)}
					</aside>
					<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
						{canvas}
						<CanvasTools tool="edit" />
					</div>
					<aside aria-label="Dock" data-dock="" className="relative z-20 flex h-full shrink-0">
						<div data-dock-panel="" className="ei-dock-panel" style={{ width: surface ? WIDTH[surface] : 0 }}>
							{(["properties", "agent"] as const).map((candidate) => (
								<div
									key={candidate}
									inert={surface !== candidate}
									aria-hidden={surface !== candidate}
									className="ei-dock-surface"
									data-visible={surface === candidate || undefined}
									style={{
										width: WIDTH[candidate],
										visibility: surface === candidate || leaving === candidate ? "visible" : "hidden",
									}}
								>
									{candidate === "properties" ? properties : agent}
								</div>
							))}
						</div>
						<div
							data-dock-strip=""
							className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5"
						>
							{(["properties", "agent"] as const).map((candidate) => (
								<button
									type="button"
									key={candidate}
									data-dock-glyph={candidate}
									aria-label={`${surface === candidate ? "Shut" : "Expand"} ${candidate}`}
									aria-pressed={surface === candidate}
									onClick={() => setSurface(surface === candidate ? null : candidate)}
									className={cn(
										"relative flex h-8 w-8 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
										surface === candidate ? "bg-control text-text" : "text-muted/70 hover:text-text",
									)}
								>
									{candidate === "properties" ? (
										<PropertiesIcon className="h-4 w-4" />
									) : (
										<AgentIcon className="h-4 w-4" />
									)}
								</button>
							))}
							<span title="Settings" className="mt-auto mb-1.5 flex h-8 w-8 items-center justify-center text-muted/70">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M13.23 6.66 14.93 7.01v1.98l-1.7.35-.58 1.41.95 1.45-1.4 1.4-1.45-.95-1.41.58-.35 1.7H7.01l-.35-1.7-1.41-.58-1.45.95-1.4-1.4.95-1.45-.58-1.41-1.7-.35V7.01l1.7-.35.58-1.41-.95-1.45 1.4-1.4 1.45.95 1.41-.58.35-1.7h1.98l.35 1.7 1.41.58 1.45-.95 1.4 1.4-.95 1.45.58 1.41Z"
										stroke="currentColor"
										strokeWidth="1.4"
										strokeLinejoin="round"
									/>
									<circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
								</svg>
							</span>
						</div>
					</aside>
				</div>
			</SpoolShell>
		</div>
	);
}
