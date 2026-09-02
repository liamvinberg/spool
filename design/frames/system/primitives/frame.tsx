import { useState } from "react";
import { cn } from "shared/lib/utils";
import { StateMark } from "shared/ui/spool/agent-rail";
import { BootCurtain } from "shared/ui/spool/boot-screen";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { CanvasTools } from "shared/ui/spool/canvas-tools";
import { CollisionNotice, NoticeStrip } from "shared/ui/spool/collision-notice";
import { ContextMenu, MenuItem, MenuRule } from "shared/ui/spool/context-menu";
import { ExportDialog } from "shared/ui/spool/export-dialog";
import { ForgetToast } from "shared/ui/spool/forget-toast";
import { FrameLabel } from "shared/ui/spool/frame-label";
import { HandNotice } from "shared/ui/spool/hand-notice";
import { HotkeySheet } from "shared/ui/spool/hotkey-sheet";
import {
	AgentIcon,
	BackIcon,
	ChevronIcon,
	CloseIcon,
	DotsIcon,
	EdgeIcon,
	EditIcon,
	FolderIcon,
	FoldIcon,
	FrameIcon,
	HandIcon,
	PanelCaret,
	PlayIcon,
	PlusIcon,
	PropertiesIcon,
	SearchIcon,
	SelectIcon,
	TermIcon,
	ThreadIcon,
} from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import {
	AddField,
	ArrowIcon,
	Chip,
	Fold,
	LinesIcon,
	Menu,
	NumField,
	PlaceField,
	Row,
	Section as FieldSection,
	SwatchChip,
	TextField,
} from "shared/ui/spool/properties-fields";
import { Across, Gap, MONO, NAME, Section, Sheet, Spec } from "shared/ui/spool/system-sheet";
import { TabStrip } from "shared/ui/spool/tab-strip";
import { ThreadMark } from "shared/ui/spool/thread-mark";
import { Toast } from "shared/ui/spool/toast";
import { TrashToast } from "shared/ui/spool/trash-toast";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { UpdateToastPill } from "shared/ui/spool/update-toast";

/**
 * Every primitive in `shared/ui/spool/`, rendered from the component itself,
 * with the states one of them has laid out across a row.
 *
 * A component with nothing to show is drawn as a gap rather than left out: the
 * dashed boxes are the honest part of this page. Most of them are whole screens,
 * which are compositions of what stands above them and have no specimen smaller
 * than themselves.
 */

const ICONS = [
	{ name: "PlayIcon", Icon: PlayIcon },
	{ name: "PlusIcon", Icon: PlusIcon },
	{ name: "BackIcon", Icon: BackIcon },
	{ name: "CloseIcon", Icon: CloseIcon },
	{ name: "SearchIcon", Icon: SearchIcon },
	{ name: "DotsIcon", Icon: DotsIcon },
	{ name: "FolderIcon", Icon: FolderIcon },
	{ name: "FrameIcon", Icon: FrameIcon },
	{ name: "TermIcon", Icon: TermIcon },
	{ name: "FoldIcon", Icon: FoldIcon },
	{ name: "ThreadIcon", Icon: ThreadIcon },
	{ name: "EdgeIcon", Icon: EdgeIcon },
	{ name: "AgentIcon", Icon: AgentIcon },
	{ name: "PropertiesIcon", Icon: PropertiesIcon },
	{ name: "SelectIcon", Icon: SelectIcon },
	{ name: "EditIcon", Icon: EditIcon },
	{ name: "HandIcon", Icon: HandIcon },
] as const;

const SURFACE = { name: "bg-surface", token: "bg-surface", value: "#1c1c1c", swatch: "#1c1c1c", group: "theme" };
const RAISED = { name: "bg-raised", token: "bg-raised", value: "#282828", swatch: "#282828", group: "theme" };
const THREAD = { name: "bg-thread", token: "bg-thread", value: "#f5391a", swatch: "#f5391a", group: "theme" };
const COLOUR_OPTIONS = [SURFACE, RAISED, THREAD];

const CANDIDATES = [
	{ token: "items-center", says: "flex" },
	{ token: "gap-2", says: "layout" },
	{ token: "text-thread", says: "color", swatch: "#f5391a" },
];

export default function Primitives() {
	return (
		<Sheet
			title="Primitives"
			says="One specimen per component in shared/ui/spool, drawn by the component itself. Every state a component has runs across its row: rest, hover, pressed, lit, working, unread, refused, empty."
		>
			<Section name="Marks" says="The four smallest things in the app, and the only ones that carry state on their own.">
				<Across>
					<Spec name="mark.tsx" says="SpoolMark" width={120} align="center">
						<SpoolMark className="h-[34px] w-[27px] text-thread" />
					</Spec>
					<Spec name="unseen-mark.tsx" says="new · changed · the box, empty" width={232}>
						<span className="flex items-center gap-6">
							<UnseenMark mark="new" />
							<UnseenMark mark="changed" />
							<span className="h-3.5 w-3.5" />
						</span>
					</Spec>
					<Spec name="thread-mark.tsx" says="running · waiting · unread · read" width={280}>
						<span className="flex items-center gap-6">
							<ThreadMark life="running" />
							<ThreadMark life="waiting" />
							<ThreadMark life="unread" />
							<ThreadMark life="read" />
						</span>
					</Spec>
					<Spec name="agent-rail.tsx" says="StateMark: pending · running · done · failed · stopped" width={320}>
						<span className="flex items-center gap-6">
							<StateMark state="pending" />
							<StateMark state="running" />
							<StateMark state="done" />
							<StateMark state="failed" />
							<StateMark state="stopped" />
						</span>
					</Spec>
				</Across>
			</Section>

			<Section name="icons.tsx" says="Sixteen pixels, 1.5 of stroke, currentColor throughout.">
				<div className="flex flex-wrap gap-x-5 gap-y-5">
					{ICONS.map(({ name, Icon }) => (
						<div
							key={name}
							className="flex w-[132px] flex-col items-center gap-2.5 rounded-md border border-border bg-canvas py-4"
						>
							<Icon className="h-4 w-4 text-text" />
							<span className={MONO}>{name}</span>
						</div>
					))}
					<div className="flex w-[132px] flex-col items-center gap-2.5 rounded-md border border-border bg-canvas py-4">
						<ChevronIcon open className="h-4 w-4 text-text" />
						<span className={MONO}>ChevronIcon</span>
					</div>
					<div className="flex w-[132px] flex-col items-center gap-2.5 rounded-md border border-border bg-canvas py-4">
						<PanelCaret dir="left" className="h-4 w-3 text-text" />
						<span className={MONO}>PanelCaret</span>
					</div>
				</div>
			</Section>

			<Section name="The shell" says="The bar, the rail, the column and the tool bar, each with the states it actually wears.">
				<Across>
					<Spec name="tab-strip.tsx" says="one focused, one not, and the door" width={320}>
						<TabStrip
							tabs={[
								{ root: "~/kaffe", name: "kaffe" },
								{ root: "~/spool", name: "spool" },
							]}
							focused="~/kaffe"
						/>
					</Spec>
					<Spec name="canvas-tools.tsx" says="select · edit · hand, and the tooltip on hover" width={280}>
						<span className="relative block h-[52px] w-full">
							<span className="absolute inset-x-0 bottom-[-24px] block">
								<CanvasTools tool="select" />
							</span>
						</span>
					</Spec>
					<Spec name="canvas-chrome.tsx" says="the dock strip: lit, rest, working, unread" width={280}>
						<span className="flex items-center gap-4">
							<Glyph lit>
								<PropertiesIcon className="h-4 w-4" />
							</Glyph>
							<Glyph>
								<AgentIcon className="h-4 w-4" />
							</Glyph>
							<Glyph working>
								<AgentIcon className="h-4 w-4" />
							</Glyph>
							<Glyph unread>
								<AgentIcon className="h-4 w-4" />
							</Glyph>
						</span>
					</Spec>
				</Across>
				<div className="flex flex-col gap-2.5">
					<div className="w-[280px] rounded-md border border-border bg-bg py-2">
						<RailRows />
					</div>
					<div className="flex items-baseline gap-2">
						<span className={NAME}>canvas-chrome.tsx</span>
						<span className={MONO}>
							the pages rail: a page open, a page shut with a count, a frame at rest, selected, unseen
						</span>
					</div>
				</div>
			</Section>

			<Section
				name="frame-label.tsx"
				says="What rides above a frame on the field. It is the one thing on the canvas that does not scale with the camera."
			>
				<div className="flex flex-wrap gap-x-6 gap-y-7">
					{(
						[
							{ says: "at rest", props: {} },
							{ says: "hovered", props: { hovered: true } },
							{ says: "selected, with its own verb", props: { selected: true } },
							{ says: "paused, and unseen", props: { paused: true, unseen: "new" as const } },
							{ says: "entered", props: { entered: true } },
							{ says: "an entered terminal", props: { entered: true, terminal: true } },
						] as const
					).map((take) => (
						<div key={take.says} className="flex w-[224px] flex-col gap-2.5">
							<div className="relative flex h-[52px] items-end rounded-md border border-border bg-canvas px-4 pb-2">
								<div className="relative w-[190px]">
									<FrameLabel
										name="cart"
										frameWidth={190}
										k={1}
										entered={false}
										paused={false}
										selected={false}
										hovered={false}
										{...take.props}
									/>
								</div>
							</div>
							<span className={MONO}>{take.says}</span>
						</div>
					))}
				</div>
			</Section>

			<Section
				name="properties-fields.tsx"
				says="The rail's controls, one per kind of property. A refused control keeps its row and loses its box: a control that vanishes reads as a bug, and a greyed one teaches you the shape of your own code."
			>
				<div className="flex flex-wrap gap-6">
					<FieldCard says="Row and Section, at rest and refused">
						<FieldSection name="layout" reason="frame.json">
							<Row name="width">
								<NumField value="390" readout="px" ok onCommit={() => {}} />
							</Row>
							<Row name="height" ok={false}>
								<NumField value="844" readout="px" ok={false} onCommit={() => {}} />
							</Row>
						</FieldSection>
					</FieldCard>
					<FieldCard says="NumField: ok, changed, faint, empty, refused">
						<Row name="padding">
							<NumField value="16" readout="px" ok onCommit={() => {}} />
						</Row>
						<Row name="gap" changed>
							<NumField value="8" readout="px" ok changed onCommit={() => {}} />
						</Row>
						<Row name="top">
							<NumField value="0" readout="px" ok faint onCommit={() => {}} />
						</Row>
						<Row name="left">
							<NumField value="" placeholder="auto" ok onCommit={() => {}} />
						</Row>
						<Row name="right" ok={false}>
							<NumField value="12" readout="px" ok={false} onCommit={() => {}} />
						</Row>
					</FieldCard>
					<FieldCard says="TextField and Menu">
						<Row name="alt">
							<TextField value="a cup of coffee" ok onCommit={() => {}} />
						</Row>
						<Row name="alt" ok={false}>
							<TextField value="" placeholder="nothing written" ok={false} onCommit={() => {}} />
						</Row>
						<Row name="background">
							<Menu current={RAISED} options={COLOUR_OPTIONS} ok filter onPick={() => {}} />
						</Row>
						<Row name="background" ok={false}>
							<Menu current={SURFACE} options={COLOUR_OPTIONS} ok={false} onPick={() => {}} />
						</Row>
					</FieldCard>
					<FieldCard says="SwatchChip, Chip, Fold, and the two icons">
						<Row name="fill">
							<span className="flex items-center gap-2">
								<SwatchChip color="#f5391a" />
								<SwatchChip color="#1c1c1c" />
								<SwatchChip color="" />
							</span>
						</Row>
						<Row name="wrap">
							<span className="flex items-center gap-1">
								<Chips />
							</span>
						</Row>
						<Row name="children">
							<Folds />
						</Row>
						<Row name="direction">
							<span className="flex items-center gap-2 text-muted">
								<ArrowIcon />
								<ArrowIcon down />
								<LinesIcon at="left" />
								<LinesIcon at="center" />
							</span>
						</Row>
					</FieldCard>
					<FieldCard says="PlaceField and AddField">
						<Row name="place" tall>
							<PlaceField align="items-center" justify="justify-between" column={false} ok onPick={() => {}} />
						</Row>
						<Row name="place" tall ok={false}>
							<PlaceField align={null} justify={null} column={false} ok={false} onPick={() => {}} />
						</Row>
						<div className="flex items-center gap-2 px-2.5 py-2">
							<AddField candidates={CANDIDATES} taken={new Set()} ok onAdd={() => {}} />
							<AddField candidates={CANDIDATES} taken={new Set()} ok={false} onAdd={() => {}} />
						</div>
					</FieldCard>
				</div>
			</Section>

			<Section
				name="Speaking"
				says="Everything that says one thing and goes. All of them are placed against the field they stand on, which is why each one sits in a box of its own."
			>
				<div className="flex flex-wrap gap-6">
					<Field says="toast.tsx: a success, said once and gone" width={640} height={200}>
						<Toast notice={{ kind: "success", message: "Copied the path to cart" }} />
					</Field>
					<Field says="toast.tsx: an error, which is the one that is red" width={640} height={200}>
						<Toast notice={{ kind: "error", message: "The capture threw. Nothing was written." }} />
					</Field>
					<Field says="trash-toast.tsx: one frame" width={640} height={200}>
						<TrashToast frames={["cart"]} />
					</Field>
					<Field says="trash-toast.tsx: a page and what went with it" width={640} height={200}>
						<TrashToast frames={["cart", "menu", "receipt"]} page="site" />
					</Field>
					<Field says="update-toast.tsx: the offer, and the one action in thread" width={960} height={200} fixed>
						<UpdateToastPill toast={{ kind: "offer", latest: "0.7.1" }} aboveCanvasTools />
					</Field>
					<Field says="update-toast.tsx: installing" width={960} height={200} fixed>
						<UpdateToastPill toast={{ kind: "updating", stage: "installing" }} aboveCanvasTools />
					</Field>
					<Field says="forget-toast.tsx: the undo window draining" width={960} height={200} fixed>
						<ForgetToast name="kaffe" windowMs={6000} />
					</Field>
					<Field says="collision-notice.tsx: the strip at the top of the field" width={640} height={200}>
						<NoticeStrip>
							<CollisionNotice
								collisions={[{ name: "cart", paths: ["frames/app/cart", "frames/site/cart"] }]}
							/>
						</NoticeStrip>
					</Field>
					<Field says="hand-notice.tsx: uncaught, failed, clamped" width={1300} height={200}>
						<NoticeStrip>
							<HandNotice said={{ kind: "uncaught" }} />
							<HandNotice said={{ kind: "failed", frame: "cart" }} />
							<HandNotice said={{ kind: "clamped", frame: "cart" }} />
						</NoticeStrip>
					</Field>
				</div>
			</Section>

			<Section name="Surfaces" says="The things that open over the canvas, at their shipped sizes.">
				<div className="flex flex-wrap gap-6">
					<Field says="context-menu.tsx: the frame menu, with the export row" width={440} height={260}>
						<ContextMenu at={{ x: 24, y: 24 }} exportAction={{ selectionCount: 3 }} />
					</Field>
					<Field says="context-menu.tsx: MenuItem, disabled and with a rule" width={440} height={260}>
						<div className="absolute top-6 left-6 flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit">
							<MenuItem label="Play from here" keys="P" />
							<MenuItem label="Reload frame" keys="R" disabled />
							<MenuRule />
							<MenuItem label="Move to Trash" keys="⌫" />
						</div>
					</Field>
					<Field says="boot-screen.tsx: BootCurtain, winding" width={440} height={260} centred>
						<span className="relative block h-[76px] w-[64px] [&>div]:pb-0">
							<BootCurtain ready={false} />
						</span>
					</Field>
					<Field says="export-dialog.tsx: three frames, PNG chosen" width={900} height={470} still>
						<ExportDialog exporting={false} frames={[{ name: "menu" }, { name: "cart" }, { name: "receipt" }]} />
					</Field>
					<Field says="export-dialog.tsx: exporting, and the error it can carry" width={900} height={470} still>
						<ExportDialog
							exporting
							error="The capture timed out on receipt."
							frames={[{ name: "menu" }, { name: "cart" }, { name: "receipt" }]}
						/>
					</Field>
					<Field says="hotkey-sheet.tsx: rendered straight from the register" width={900} height={470} still>
						<HotkeySheet groups={HOTKEYS} />
					</Field>
					<Field says="browser-tab.tsx: PlayedTab, the window a played frame opens in" width={900} height={300} plain>
						<PlayedTab title="cart" url="localhost:7766/play/cart">
							<div className="flex h-full items-center justify-center bg-[#ffffff]">
								<span className="font-sans text-[#111] text-base">kaffe, in kaffe's own voice</span>
							</div>
						</PlayedTab>
					</Field>
				</div>
			</Section>

			<Section
				name="Nothing to show"
				says="Components that are whole screens, or that need a canvas and a running turn behind them. They are listed rather than left out, because a gap you can see is a list of work."
			>
				<div className="flex flex-wrap gap-x-6 gap-y-7">
					<Gap name="canvas-screen.tsx" says="the canvas, whole" />
					<Gap name="home-screen.tsx" says="the projects registry" />
					<Gap name="empty-screen.tsx" says="a project with no frames" />
					<Gap name="find-screen.tsx" says="the finder over a canvas" />
					<Gap name="find-palette.tsx" says="needs the frame list" />
					<Gap name="dock-screen.tsx" says="the column, whole" />
					<Gap name="properties-screen.tsx" says="the rail over a document" />
					<Gap name="properties-rail.tsx" says="needs a selected element" />
					<Gap name="select-screen.tsx" says="the selection ladder" />
					<Gap name="player-stage.tsx" says="needs a walk" />
					<Gap name="play-rail.tsx" says="needs a turn" />
					<Gap name="agent-rail.tsx" says="needs a transcript" />
					<Gap name="say.tsx" says="needs a stream" />
					<Gap name="limit.tsx" says="needs a rate limit" />
					<Gap name="model-control.tsx" says="needs the model list" />
					<Gap name="thread-strip.tsx" says="needs threads" />
					<Gap name="picker-parts.tsx" says="needs a disk" />
					<Gap name="picker-search.tsx" says="needs a disk" />
					<Gap name="lightbox.tsx" says="needs a shot" />
					<Gap name="shell.tsx" says="the bar, whole" />
					<Gap name="real-pages.ts" says="data, not a component" />
					<Gap name="explore/play-app/desk.tsx" says="EdgeBar: revealed by dwell" />
				</div>
			</Section>
		</Sheet>
	);
}

/* ---------- the page's own scaffolding ---------- */

function Field({
	says,
	width,
	height,
	children,
	centred = false,
	fixed = false,
	plain = false,
	still = false,
}: {
	says: string;
	width: number;
	height: number;
	children: React.ReactNode;
	centred?: boolean;
	/** the component is `fixed`, so the box gives it a containing block of its own */
	fixed?: boolean;
	/** the specimen brings its own surface: no canvas under it */
	plain?: boolean;
	/**
	 * A dialog takes the focus when it opens, which on a page of specimens means
	 * the page jumps to whichever one mounted last. `inert` makes the box a
	 * picture: nothing inside it can be focused, so nothing inside it can move
	 * the page.
	 */
	still?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2.5" style={{ width }}>
			<div
				className={cn(
					"relative overflow-hidden rounded-md border border-border",
					plain ? "" : "bg-canvas",
					centred && "flex items-center justify-center",
					fixed && "[transform:translate(0)]",
				)}
				style={{ height }}
				{...(still ? { inert: true } : {})}
			>
				{children}
			</div>
			<span className={cn("min-w-0", MONO)}>{says}</span>
		</div>
	);
}

function FieldCard({ says, children }: { says: string; children: React.ReactNode }) {
	return (
		<div className="flex w-[416px] flex-col gap-2.5">
			<div className="overflow-hidden rounded-md border border-border bg-bg">{children}</div>
			<span className={cn("min-w-0", MONO)}>{says}</span>
		</div>
	);
}

function Chips() {
	const [on, setOn] = useState(true);
	return (
		<>
			<Chip on={on} label="wrap" ok onChange={setOn} />
			<Chip on={false} label="nowrap" ok onChange={() => {}} />
			<Chip on={false} label="reverse" ok={false} onChange={() => {}} />
		</>
	);
}

function Folds() {
	const [open, setOpen] = useState(true);
	return (
		<span className="flex items-center gap-3">
			<Fold open={open} ok onToggle={() => setOpen((held) => !held)} />
			<Fold open={false} ok onToggle={() => {}} />
			<Fold open={false} ok={false} onToggle={() => {}} />
		</span>
	);
}

/** the dock's glyph, at each of the four things it says */
function Glyph({
	lit = false,
	working = false,
	unread = false,
	children,
}: {
	lit?: boolean;
	working?: boolean;
	unread?: boolean;
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"relative flex h-8 w-8 items-center justify-center rounded-sm",
				lit ? "bg-raised text-text" : "text-muted/70",
			)}
		>
			{children}
			{working ? (
				<svg
					viewBox="0 0 14 14"
					aria-hidden="true"
					fill="none"
					className="-right-1 absolute top-0 h-3 w-3 animate-agent-spin text-text/60"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			) : null}
			{unread ? (
				<span
					aria-hidden="true"
					className="-right-0.5 absolute top-0.5 h-1.5 w-1.5 animate-unseen-in rounded-full bg-thread"
				/>
			) : null}
		</span>
	);
}

/** the shipped rail's own metrics: a page row is 32, a frame row 28, one indent step 10 */
function RailRows() {
	return (
		<div>
			<div className="relative flex h-8 items-center bg-surface pr-1.5">
				<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
				<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
					<ChevronIcon open className="h-2.5 w-2.5" />
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<FolderIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-sm">app</span>
				</span>
			</div>
			<div className="relative">
				<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
				{[
					{ name: "menu", selected: false, mark: undefined },
					{ name: "cart", selected: true, mark: undefined },
					{ name: "receipt", selected: false, mark: "new" as const },
				].map((frame) => (
					<div
						key={frame.name}
						className={cn("relative flex h-7 items-center pr-1.5", frame.selected && "bg-surface")}
					>
						<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
						<span className="flex min-w-0 flex-1 items-center gap-2 pl-[34px]">
							<FrameIcon
								className={cn("h-3.5 w-3.5 shrink-0", frame.selected ? "text-thread" : "text-muted")}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
									frame.selected || frame.mark !== undefined ? "text-text" : "text-muted",
								)}
							>
								{frame.name}
							</span>
						</span>
						{frame.mark === undefined ? null : <UnseenMark mark={frame.mark} />}
					</div>
				))}
			</div>
			<div className="flex h-8 items-center pr-1.5">
				<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
					<ChevronIcon className="h-2.5 w-2.5" />
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-muted leading-sm">site</span>
				</span>
				<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">14</span>
			</div>
		</div>
	);
}

const HOTKEYS = [
	{
		group: "Frames",
		rows: [
			{ id: "enter", label: "Enter the selected frame", keys: ["⏎"] },
			{ id: "play", label: "Play the flow from here", keys: ["P"] },
			{ id: "reload", label: "Reload the selected frames", keys: ["R"] },
			{ id: "menu", label: "Open the frame menu", keys: [], gesture: "right-click" },
		],
	},
	{
		group: "Camera",
		rows: [
			{ id: "zoom-in", label: "Zoom in", keys: ["+"] },
			{ id: "zoom-reset", label: "Zoom to 100%", keys: ["0"] },
			{ id: "pan", label: "Pan the canvas", keys: [], gesture: "space and drag" },
		],
	},
	{
		group: "Pages",
		rows: [
			{ id: "rename", label: "Rename the selected row", keys: ["⏎"] },
			{ id: "trash", label: "Move the selection to the Trash", keys: ["⌫"] },
		],
	},
] as const;
