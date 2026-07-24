import { cn } from "../../shared/lib/utils";
import { CursorIcon, HandIcon, SelectIcon } from "../../shared/ui/spool-icons";
import { SpoolShell } from "../../shared/ui/spool-shell";

/**
 * directing — B-shape: annotate is a verb on the select tool.
 *
 * No fourth tool. The toolbar stays interact / select / hand. Because select
 * already resolves an element's source location, the note is reached from the
 * selection itself: a keystroke hint rides the picked element and a right-click
 * offers "Add note". A finished order sits on a second row. The cost this shape
 * pays is legible here too: annotate has no home on empty canvas, because there
 * is nothing to select there.
 */

const TOOLS = [
	{ id: "interact", label: "interact", key: null, Icon: CursorIcon },
	{ id: "select", label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", key: "H", Icon: HandIcon },
] as const;

export default function DirectingVerbSelect() {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} zoom="100%" showCanvasControls={false}>
			<div className="relative h-full w-full cursor-crosshair overflow-hidden bg-canvas">
				<DotGrid />

				{/* the result: a finished order on the noted row, out in the left margin */}
				<div className="absolute" style={{ left: 260, top: 376 }}>
					<NoteBubble n={1} target="settings · HapticsRow" order="delete this" />
					<NoteLeader />
				</div>

				{/* the subject: a compact settings panel, one row picked */}
				<div className="absolute" style={{ left: 560, top: 210, width: 316 }}>
					<FrameLabel name="settings" />
					<Settings selectedRow="appearance" notedRow="haptics" />
				</div>

				{/* the affordance: right-click on the picked element offers the note verb */}
				<div className="absolute" style={{ left: 924, top: 302 }}>
					<ContextMenu />
				</div>

				<Toolbar />
			</div>
		</SpoolShell>
	);
}

/* ---------- toolbar: the three navigation tools, select committed ---------- */

function Toolbar() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2.5">
			<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs text-muted leading-3 backdrop-blur">
				<span className="text-thread">select</span>
				<span className="text-muted/60">pick an element, then</span>
				<Kbd>C</Kbd>
				<span className="text-muted/60">to note it</span>
			</div>
			<div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				{TOOLS.map((meta) => (
					<ToolButton key={meta.id} label={meta.label} kbd={meta.key} active={meta.id === "select"} Icon={meta.Icon} />
				))}
			</div>
		</div>
	);
}

function ToolButton({
	label,
	kbd,
	active,
	Icon,
}: {
	label: string;
	kbd: string | null;
	active: boolean;
	Icon: (p: { className?: string }) => React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			className={cn(
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
				active ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text",
			)}
		>
			<Icon className="h-[18px] w-[18px]" />
			<span className="pointer-events-none absolute -top-8 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
				{label}
				{kbd ? <Kbd>{kbd}</Kbd> : null}
			</span>
		</button>
	);
}

/* ---------- the note verb, reached from a selection ---------- */

function ContextMenu() {
	const items = [
		{ label: "Add note", kbd: "C", accent: true },
		{ label: "Copy source", kbd: "⌘C", accent: false },
	];
	return (
		<div className="w-[196px] rounded-md border border-border-raised bg-bg/95 py-1 font-sans backdrop-blur">
			{items.map((it) => (
				<div
					key={it.label}
					className={cn(
						"mx-1 flex items-center justify-between rounded-sm px-2.5 py-1.5 text-base leading-none",
						it.accent ? "bg-surface" : "",
					)}
				>
					<span className={it.accent ? "text-text" : "text-muted"}>{it.label}</span>
					<Kbd>{it.kbd}</Kbd>
				</div>
			))}
			<div className="my-1 h-px bg-border" />
			<div className="mx-1 flex items-center justify-between rounded-sm px-2.5 py-1.5 text-base text-muted leading-none">
				<span>Clear selection</span>
				<Kbd>esc</Kbd>
			</div>
		</div>
	);
}

function NoteBubble({ n, target, order }: { n: number; target: string; order: string }) {
	return (
		<div className="flex w-[260px] items-start gap-2 rounded-md border border-border-raised bg-bg/95 px-3 py-2.5 backdrop-blur">
			<PinChip n={n} />
			<div className="min-w-0 flex-1">
				<p className="font-sans text-base text-text leading-base">{order}</p>
				<p className="mt-1 flex items-center gap-1.5 font-mono text-2xs text-muted leading-3">
					<span className="truncate">{target}</span>
					<span className="text-muted/40">·</span>
					<span className="shrink-0 text-muted/70">queued</span>
				</p>
			</div>
		</div>
	);
}

/** the note sits in the left margin; the leader reaches right, to its element */
function NoteLeader() {
	return (
		<span className="-right-10 absolute top-[26px] flex w-10 items-center">
			<span className="h-px flex-1 bg-thread/60" />
			<span className="-mr-1 h-2 w-2 rounded-full bg-thread" />
		</span>
	);
}

function PinChip({ n }: { n: number }) {
	return (
		<span className="mt-px flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
			{n}
		</span>
	);
}

/* ---------- the settings subject ---------- */

function Settings({ selectedRow, notedRow }: { selectedRow: string; notedRow: string }) {
	const rows = [
		{ id: "notifications", name: "Notifications", value: "on", kind: "toggle" as const },
		{ id: "appearance", name: "Appearance", value: "Dark", kind: "choice" as const },
		{ id: "sync", name: "Sync over cellular", value: "off", kind: "toggle" as const },
		{ id: "haptics", name: "Haptics", value: "on", kind: "toggle" as const },
	];
	return (
		<div className="overflow-hidden rounded-md border border-border bg-surface">
			<div className="flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
				<div className="flex items-center gap-1.5">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<span className="font-mono text-2xs text-muted leading-3">live</span>
				</div>
				<div className="flex items-end gap-[3px]" aria-hidden="true">
					{[9, 14, 7].map((barHeight) => (
						<span key={barHeight} className="w-[3px] rounded-full bg-thread/70" style={{ height: barHeight }} />
					))}
				</div>
			</div>
			<div className="flex flex-col gap-0.5 px-3 py-2.5">
				{rows.map((r) => {
					const selected = r.id === selectedRow;
					const noted = r.id === notedRow;
					return (
						<div key={r.id} className="relative">
							{selected ? <SelectionShell label="PreferenceRow" /> : null}
							{noted ? (
								<span className="-inset-x-1.5 pointer-events-none absolute inset-y-0 rounded-[3px] border border-thread/40 bg-thread/[0.05]" />
							) : null}
							<div className="relative flex h-9 items-center justify-between">
								<span className="font-sans text-base text-text leading-none">{r.name}</span>
								{r.kind === "toggle" ? (
									<Toggle on={r.value === "on"} />
								) : (
									<span className="font-mono text-sm text-muted leading-none">{r.value}</span>
								)}
							</div>
						</div>
					);
				})}
				<div className="mt-1.5 border-border-raised/60 border-t pt-2.5">
					<span className="font-sans text-base text-muted leading-none">Sign out</span>
				</div>
			</div>
		</div>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span className={cn("flex h-4 w-7 items-center rounded-full px-[2px]", on ? "bg-thread/70" : "bg-raised")}>
			<span className={cn("h-3 w-3 rounded-full bg-text transition-transform", on ? "translate-x-3" : "translate-x-0")} />
		</span>
	);
}

/** select's outline: thread ring, corner handles, and the resolved element name */
function SelectionShell({ label }: { label: string }) {
	return (
		<>
			<span className="-inset-x-1.5 pointer-events-none absolute inset-y-0 rounded-[3px] border border-thread/70" />
			{["-left-[7px] -top-[3px]", "-right-[7px] -top-[3px]", "-bottom-[3px] -left-[7px]", "-bottom-[3px] -right-[7px]"].map(
				(pos) => (
					<span
						key={pos}
						className={cn(
							"pointer-events-none absolute h-[7px] w-[7px] rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
							pos,
						)}
					/>
				),
			)}
			<span className="-left-[10px] -translate-x-full absolute top-1/2 flex -translate-y-1/2 items-center gap-1">
				<span className="rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">{label}</span>
				<span className="h-px w-2 bg-thread/70" />
			</span>
		</>
	);
}

/* ---------- shared bits ---------- */

function FrameLabel({ name }: { name: string }) {
	return (
		<div className="mb-1.5 flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
			<span className="text-2xs text-thread">▸</span>
			<span className="text-thread">{name}</span>
		</div>
	);
}

function DotGrid() {
	return (
		<div
			className="pointer-events-none absolute inset-0 opacity-40"
			style={{
				backgroundImage: "radial-gradient(circle, var(--color-border-raised) 0.75px, transparent 0.75px)",
				backgroundSize: "22px 22px",
			}}
		/>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
