import { cn } from "shared/lib/utils";
import { MONO, NAME, Section, Sheet } from "shared/ui/spool/system-sheet";

/**
 * Two families and six steps, and the app is built out of them.
 *
 * Familjen Grotesk is what a person says; Fragment Mono is what the machine
 * prints. Each step carries the leading it is paired with in `src/ui` and the
 * places that pairing actually appears, read off the shipped components rather
 * than invented for this page.
 */

interface Step {
	name: string;
	/** the utility, written out: Tailwind reads the source, so a built name is no name */
	step: string;
	size: string;
	leading: string;
	lead: string;
	sans: string;
	mono: string;
	used: readonly string[];
}

const STEPS: readonly Step[] = [
	{
		name: "2xs",
		step: "text-2xs",
		size: "10px",
		leading: "leading-3",
		lead: "12px",
		sans: "Vary sentence length inside a block",
		mono: "live · esc exits",
		used: [
			"frame-label.tsx: the entered chip and the paused caret",
			"sidebar.tsx: a page's frame count",
			"collision-notice.tsx: every pill in the strip",
			"canvas-tools.tsx: the tool tooltip and its key",
			"properties-fields.tsx: LABEL, the name on the left of a row",
			"hotkey-sheet.tsx: the key faces and \"esc closes\"",
		],
	},
	{
		name: "xs",
		step: "text-xs",
		size: "11px",
		leading: "leading-xs",
		lead: "16px",
		sans: "Familjen Grotesk at eleven",
		mono: "spool-canvas--menu",
		used: [
			"sidebar.tsx: a frame row, which is most of the rail",
			"shell.tsx: the zoom readout at the right of the bar",
			"trash-toast.tsx and forget-toast.tsx: the ⌘Z chord",
			"export-dialog.tsx: the selected count",
		],
	},
	{
		name: "sm",
		step: "text-sm",
		size: "12px",
		leading: "leading-sm",
		lead: "18px",
		sans: "Familjen Grotesk at twelve",
		mono: "app / cart",
		used: [
			"sidebar.tsx: a page row, one step up from its frames",
			"frame-label.tsx: the frame's own name, at leading-4",
			"properties-fields.tsx: VALUE, every field's value, at leading-4",
			"hotkey-sheet.tsx: a group heading",
		],
	},
	{
		name: "base",
		step: "text-base",
		size: "13px",
		leading: "leading-base",
		lead: "20px",
		sans: "Moved cart to Trash",
		mono: "13px, and mono is rare here",
		used: [
			"context-menu.tsx: every row of the frame menu",
			"toast.tsx and trash-toast.tsx: the sentence itself",
			"hotkey-sheet.tsx: what a shortcut does",
			"sidebar.tsx: the Pages heading, at semibold",
		],
	},
	{
		name: "md",
		step: "text-md",
		size: "14px",
		leading: "leading-md",
		lead: "22px",
		sans: "Export 3 frames",
		mono: "/",
		used: [
			"export-dialog.tsx: the dialog's title",
			"hotkey-sheet.tsx: the sheet's title",
			"shell.tsx: the wordmark beside the mark",
			"find-palette.tsx: the summon key left standing as the prompt",
		],
	},
	{
		name: "lg",
		step: "text-lg",
		size: "18px",
		leading: "leading-lg",
		lead: "26px",
		sans: "Projects",
		mono: "18px, unused in mono",
		used: ["home.tsx: the Projects heading, the largest type in the app"],
	},
];

const WEIGHTS = [
	{ name: "regular", value: "400", klass: "font-normal", of: "prose, menu rows, every readout" },
	{ name: "medium", value: "500", klass: "font-medium", of: "Undo, Export, an active tab, a dialog title" },
	{ name: "semibold", value: "600", klass: "font-semibold", of: "the wordmark, Pages, Shortcuts, Projects" },
] as const;

export default function Type() {
	return (
		<Sheet
			title="Type"
			says="Familjen Grotesk for anything a person says, Fragment Mono for anything the machine prints. Six steps, each with the leading it is paired with and the files that pair it."
		>
			<Section
				name="The scale"
				says="Both families at every step, side by side, with where the app spends each one."
			>
				<div className="flex flex-col">
					<div className="flex gap-8 border-border border-b pb-2">
						<span className={cn("w-[96px] shrink-0", MONO)}>step</span>
						<span className={cn("w-[380px] shrink-0", MONO)}>Familjen Grotesk</span>
						<span className={cn("w-[340px] shrink-0", MONO)}>Fragment Mono</span>
						<span className={MONO}>where it is spent</span>
					</div>
					{STEPS.map((step) => (
						<div key={step.name} className="flex gap-8 border-border border-b py-6">
							<div className="flex w-[96px] shrink-0 flex-col gap-1">
								<span className={NAME}>--text-{step.name}</span>
								<span className={MONO}>{step.size}</span>
								<span className={MONO}>{step.lead}</span>
							</div>
							<span
								className={cn("w-[380px] shrink-0 font-sans text-text", step.step, step.leading)}
							>
								{step.sans}
							</span>
							<span
								className={cn("w-[340px] shrink-0 font-mono text-text", step.step, step.leading)}
							>
								{step.mono}
							</span>
							<ul className="flex min-w-0 flex-1 flex-col gap-1">
								{step.used.map((where) => (
									<li key={where} className={cn("truncate", MONO)}>
										{where}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</Section>

			<Section
				name="Weight"
				says="Three, and the third one is nearly always a heading. Weight is how a line is set apart, never colour."
			>
				<div className="flex flex-wrap gap-6">
					{WEIGHTS.map((weight) => (
						<div key={weight.name} className="flex w-[416px] flex-col gap-3 rounded-md border border-border px-5 py-4">
							<span className={cn("text-md leading-md", weight.klass)}>
								Frames are files. spool renders them.
							</span>
							<div className="flex items-baseline gap-2">
								<span className={NAME}>--font-weight-{weight.name}</span>
								<span className={MONO}>{weight.value}</span>
							</div>
							<span className="text-muted text-xs leading-xs">{weight.of}</span>
						</div>
					))}
				</div>
			</Section>

			<Section
				name="Tracking, and the two families together"
				says="Only headings are tightened, by one hundredth of an em. Everything else is set at zero, because mono is already wide and prose at 13px does not need help."
			>
				<div className="flex flex-wrap gap-6">
					<div className="flex w-[416px] flex-col gap-3 rounded-md border border-border px-5 py-4">
						<span className="font-semibold text-lg tracking-tight leading-lg">Projects</span>
						<div className="flex items-baseline gap-2">
							<span className={NAME}>--tracking-tight</span>
							<span className={MONO}>-0.01em</span>
						</div>
						<span className="text-muted text-xs leading-xs">headings and the wordmark, nothing else</span>
					</div>
					<div className="flex w-[416px] flex-col gap-3 rounded-md border border-border px-5 py-4">
						<span className="text-base leading-base">Moved cart to Trash</span>
						<div className="flex items-baseline gap-2">
							<span className={NAME}>--tracking-normal</span>
							<span className={MONO}>0em</span>
						</div>
						<span className="text-muted text-xs leading-xs">prose, rows, readouts</span>
					</div>
					<div className="flex w-[416px] flex-col gap-3 rounded-md border border-border px-5 py-4">
						<span className="text-base leading-base">
							Moved <span className="font-mono text-sm leading-4">cart</span> to Trash
						</span>
						<span className={NAME}>the two together</span>
						<span className="text-muted text-xs leading-xs">
							a name inside a sentence drops one step, so the mono sits on the same line rather than over it
						</span>
					</div>
				</div>
			</Section>
		</Sheet>
	);
}
