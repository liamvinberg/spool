import { type ReactNode, useEffect, useRef, useState } from "react";
import { accelLabel } from "../../runtime/platform-keys";
import { parseSetting, type SettingKey, type ThemeToken } from "../../settings/registry";
import { ACCENTS, parseTheme, printTheme, type ThemeSpec } from "../../settings/themes";
import { cn } from "../cn";
import { Button, ToggleButton } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { ColourField, Textarea } from "../primitives/inputs";
import { Popover } from "../primitives/overlays";
import { Segment, SegmentedControl } from "../primitives/selection";
import type { useWriteSetting, useWriteSettings } from "../settings";

/** The parts the settings page is drawn from, over the primitives. */

export type Tokens = Readonly<Record<ThemeToken, string>>;
export type Write = ReturnType<typeof useWriteSetting>;
export type WriteMany = ReturnType<typeof useWriteSettings>;

export const FILES = { project: "design/canvas.json", machine: "~/.spool/config.json" } as const;

/** A hairline over every line, and under the last, as the page's rows stand. */
export const LINE = "border-line-default border-t py-4";

/** A section's head: its title, and once, under it, the file it writes. */
export function Head({ title, file, aside }: { title: ReactNode; file?: ReactNode; aside?: ReactNode }) {
	return (
		<header className="flex items-end justify-between gap-4 pb-6">
			<div className="flex min-w-0 flex-col gap-1">
				<h1 className="text-primary type-page">{title}</h1>
				{file === undefined ? null : <p className="text-tertiary type-detail">{file}</p>}
			</div>
			{aside}
		</header>
	);
}

/**
 * One setting: the label and its control share a control-md line, so the eye
 * reads across one line; the registry's sentence sits under the label alone,
 * held to the dialog measure. A refusal shows under it, in the daemon's words.
 */
export function SettingLine({
	label,
	says,
	reason,
	control,
	className,
}: {
	label: ReactNode;
	says?: ReactNode;
	reason?: string | undefined;
	control: ReactNode;
	className?: string | undefined;
}) {
	return (
		<div className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-0.5", LINE, className)}>
			<span className="flex min-h-control-md items-center text-primary type-control">{label}</span>
			<span className="row-span-2 flex min-h-control-md items-start justify-end">
				<span className="flex min-h-control-md items-center gap-2">{control}</span>
			</span>
			{says === undefined ? null : <span className="max-w-dialog text-secondary type-label">{says}</span>}
			{reason === undefined ? null : <Reason className="col-span-2">{reason}</Reason>}
		</div>
	);
}

/** A sentence with `code` spans set in mono, as the registry writes them. */
export function Says({ text }: { text: string }) {
	return (
		<>
			{text.split("`").map((part, at) =>
				at % 2 === 1 ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
					<span key={at} className="type-detail">
						{part}
					</span>
				) : (
					part
				),
			)}
		</>
	);
}

/** The daemon's refusal, in its own words, under the line that asked. */
export function Reason({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span role="alert" className={cn("pt-1 text-accent-strong type-detail", className)}>
			{children}
		</span>
	);
}

/**
 * A colour: the swatch is the OS's own picker behind it, writing as it drags
 * on a short trailing debounce, and the field is the hex, written on enter or
 * blur, only when the registry would take it. A field that would be refused
 * says so and goes back to the file's value.
 */
export function ColourControl({
	settingKey,
	value,
	label,
	lit = false,
	onChange,
	onRefuse,
}: {
	settingKey: SettingKey;
	value: string;
	label: string;
	lit?: boolean;
	onChange: (next: string) => void;
	onRefuse?: ((reason: string) => void) | undefined;
}) {
	const [refused, setRefused] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const commit = (typed: string) => {
		const parsed = parseSetting(settingKey, typed);
		if (!parsed.ok) {
			setRefused(true);
			onRefuse?.(parsed.reason);
			return;
		}
		setRefused(false);
		if (parsed.value !== value) onChange(parsed.value as string);
	};
	return (
		<ColourField
			value={value}
			label={label}
			lit={lit}
			error={refused}
			onPick={(next) => {
				clearTimeout(timer.current);
				timer.current = setTimeout(() => onChange(next), 100);
			}}
			onType={commit}
			onTypeStart={() => setRefused(false)}
		/>
	);
}

/**
 * The thread alone: the accents as swatches (a 16 dot in a 24 target, ringed in
 * primary ink when chosen), a hairline, then any colour as a ColourControl.
 */
export function Swatches({
	settingKey,
	value,
	onSwatch,
	onChange,
	onRefuse,
}: {
	settingKey: SettingKey;
	value: string;
	onSwatch: (hex: string) => void;
	onChange: (hex: string) => void;
	onRefuse: (reason: string) => void;
}) {
	const known = ACCENTS.some((accent) => accent.hex === value);
	return (
		<span className="flex items-center gap-1">
			<span className="flex items-center gap-1">
				{ACCENTS.map((accent) => {
					const lit = accent.hex === value;
					return (
						<button
							key={accent.hex}
							type="button"
							aria-pressed={lit}
							aria-label={accent.name}
							title={accent.name}
							onClick={() => onSwatch(accent.hex)}
							className={cn(
								"focus-ring flex size-control-sm shrink-0 items-center justify-center rounded-full border",
								"transition-[border-color,scale] duration-fast ease-out active:scale-90 motion-reduce:transition-none",
								lit ? "border-primary" : "border-transparent hover:border-line-strong",
							)}
						>
							<span className="size-4 rounded-full" style={{ background: accent.hex }} />
						</button>
					);
				})}
			</span>
			<span aria-hidden="true" className="mx-1 h-4 w-px bg-line-default" />
			<ColourControl
				settingKey={settingKey}
				value={value}
				label="Thread"
				lit={!known}
				onChange={onChange}
				onRefuse={onRefuse}
			/>
		</span>
	);
}

/**
 * spool's window at any size, in the colours it is handed: the bar with its
 * tabs, the pages pane with its current row, the canvas with three frames and a
 * thread between two, the toolbar, and the far pane closed to its rail. Drawn
 * from a theme's ten as data, so a theme shows on it before it is applied.
 */
export function WindowPreview({ tokens, className }: { tokens: Tokens; className?: string | undefined }) {
	const t = tokens;
	const line = { borderColor: t.border };
	const frame = (left: string, edge: string) => (
		<span
			className="absolute top-[24%] h-[46%] w-[22%] rounded-[2px] border"
			style={{ left, background: t.surface, borderColor: edge }}
		/>
	);
	return (
		<span aria-hidden="true" className={cn("relative block overflow-hidden", className)} style={{ background: t.bg }}>
			{/* the window bar: Home, two tabs, the help and the gear */}
			<span className="absolute inset-x-0 top-0 h-[9%] border-b" style={line}>
				<span
					className="absolute top-[36%] left-[2%] h-[28%] w-[5%] rounded-[2px] opacity-60"
					style={{ background: t.muted }}
				/>
				<span
					className="absolute top-[18%] bottom-0 left-[9%] w-[14%] rounded-t-[3px]"
					style={{ background: t.surface }}
				>
					<span
						className="absolute top-[34%] left-[10%] h-[34%] w-[12%] rounded-[1px]"
						style={{ background: t.thread }}
					/>
					<span
						className="absolute top-[38%] left-[28%] h-[26%] w-[48%] rounded-[1px] opacity-80"
						style={{ background: t.text }}
					/>
				</span>
				<span
					className="absolute top-[38%] left-[26%] h-[26%] w-[8%] rounded-[1px] opacity-50"
					style={{ background: t.muted }}
				/>
				<span
					className="absolute top-[30%] right-[4.5%] size-[1.4%] min-h-[3px] rounded-full opacity-70"
					style={{ background: t.muted }}
				/>
				<span
					className="absolute top-[30%] right-[2%] size-[1.4%] min-h-[3px] rounded-full opacity-70"
					style={{ background: t.muted }}
				/>
			</span>
			{/* the pages pane, its tab underlined in the thread */}
			<span className="absolute top-[9%] bottom-0 left-0 w-[17%] border-r" style={line}>
				<span className="absolute inset-x-0 top-0 h-[8%] border-b" style={line}>
					<span
						className="absolute top-[38%] left-[16%] h-[26%] w-[30%] rounded-[1px] opacity-80"
						style={{ background: t.text }}
					/>
					<span
						className="absolute bottom-0 left-[16%] h-[6%] min-h-px w-[30%]"
						style={{ background: t.thread }}
					/>
				</span>
				<span className="absolute top-[15%] inset-x-[5%] h-[6%] rounded-[2px]" style={{ background: t.surface }} />
				{[12, 19, 26, 33].map((top, at) => (
					<span
						key={top}
						className="absolute left-[16%] h-[2.6%] rounded-[1px]"
						style={{
							top: `${top + 4.7}%`,
							width: `${44 - at * 5}%`,
							background: at === 0 ? t.text : t.muted,
							opacity: at === 0 ? 0.85 : 0.5,
						}}
					/>
				))}
			</span>
			{/* the canvas */}
			<span className="absolute top-[9%] right-[4%] bottom-0 left-[17%]" style={{ background: t.canvas }}>
				{frame("10%", t.thread)}
				{frame("39%", t["border-raised"])}
				{frame("68%", t["border-raised"])}
				<svg
					aria-hidden="true"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					className="absolute inset-0 size-full overflow-visible"
				>
					<path
						d="M28 70 C 30 84, 46 84, 50 70"
						fill="none"
						stroke={t.thread}
						strokeWidth="1.5"
						vectorEffect="non-scaling-stroke"
						strokeLinecap="round"
					/>
				</svg>
				<span
					className="absolute bottom-[6%] left-[44%] h-[7%] w-[12%] rounded-[3px] border"
					style={{ background: t.raised, borderColor: t["border-raised"] }}
				/>
			</span>
			{/* the far pane, closed to its rail of icons */}
			<span className="absolute top-[9%] right-0 bottom-0 w-[4%] border-l" style={line}>
				{[6, 13, 20].map((top) => (
					<span
						key={top}
						className="absolute left-[30%] h-[3%] w-[40%] rounded-[1px] opacity-60"
						style={{ top: `${top}%`, background: t.muted }}
					/>
				))}
			</span>
		</span>
	);
}

/** A theme's ten as a strip of four, the way a list row can carry it. */
export function ThemeStrip({ tokens }: { tokens: Tokens }) {
	return (
		<span
			aria-hidden="true"
			className="flex h-3 w-10 shrink-0 overflow-hidden rounded-full border"
			style={{ borderColor: tokens["border-raised"] }}
		>
			{[tokens.bg, tokens.surface, tokens.text, tokens.thread].map((hex, at) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: four fixed places
				<span key={at} className="flex-1" style={{ background: hex }} />
			))}
		</span>
	);
}

/** A theme as words and four of its colours; resting on it dresses the preview. */
export function ThemeChip({
	theme,
	selected,
	onPick,
	onPreview,
}: {
	theme: ThemeSpec;
	selected: boolean;
	onPick: () => void;
	onPreview: (theme: ThemeSpec | null) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onPick}
			onPointerEnter={() => onPreview(theme)}
			onPointerLeave={() => onPreview(null)}
			onFocus={() => onPreview(theme)}
			onBlur={() => onPreview(null)}
			className={cn(
				"focus-ring flex h-row-roomy min-w-0 items-center gap-2 rounded-sm border px-3 text-left type-control",
				"transition-[background-color,border-color,color] duration-fast ease-out motion-reduce:transition-none",
				selected
					? "border-accent bg-state-selected text-primary"
					: "border-line-default text-secondary hover:border-line-strong hover:bg-state-hover-raised hover:text-primary",
			)}
		>
			<ThemeStrip tokens={theme.tokens} />
			<span className="truncate">{theme.name}</span>
		</button>
	);
}

/**
 * A theme out and a theme in, as text. Copy puts the theme on the clipboard;
 * Paste opens a field for one and applies it once it parses. Text rather than
 * a file because a theme is three hundred bytes, and the places people trade
 * them are chats and gists.
 */
export function ShareTheme({ theme, onPaste }: { theme: ThemeSpec; onPaste: (theme: ThemeSpec) => void }) {
	const [copied, setCopied] = useState(false);
	const [pasting, setPasting] = useState(false);
	const [draft, setDraft] = useState("");
	const [reason, setReason] = useState<string | undefined>();
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1400);
		return () => clearTimeout(timer);
	}, [copied]);
	const copy = () => {
		void navigator.clipboard?.writeText(printTheme(theme)).then(() => setCopied(true));
	};
	const submit = () => {
		const parsed = parseTheme(draft);
		if (!parsed.ok) {
			setReason(parsed.reason);
			return;
		}
		setReason(undefined);
		setDraft("");
		setPasting(false);
		onPaste(parsed.theme);
	};
	return (
		<span className="relative flex items-center gap-1">
			<Button size="sm" variant="ghost" onClick={copy}>
				{copied ? "Copied" : "Copy"}
			</Button>
			<ToggleButton size="sm" pressed={pasting} onPressedChange={setPasting}>
				Paste
			</ToggleButton>
			{pasting ? (
				<Popover aria-label="Paste a theme" className="absolute top-[calc(100%+4px)] right-0 z-20 w-toast gap-2">
					<Textarea
						label="Theme to paste"
						mono
						rows={5}
						value={draft}
						placeholder={'{ "name": "…", "appearance": "dark", "tokens": { … } }'}
						onValueChange={(next) => {
							setDraft(next);
							setReason(undefined);
						}}
						error={reason !== undefined}
						textareaProps={{
							autoFocus: true,
							onKeyDown: (event) => {
								if (event.key === "Escape") {
									event.stopPropagation();
									setPasting(false);
								}
								if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
							},
						}}
					/>
					{reason === undefined ? null : <Reason className="pt-0">{reason}</Reason>}
					<span className="flex items-center justify-between">
						<span className="flex items-center gap-1 text-secondary type-detail">
							<Kbd>{`${accelLabel().replace(/\+$/, "")}↵`}</Kbd> applies
						</span>
						<Button size="sm" variant="primary" onClick={submit}>
							Apply
						</Button>
					</span>
				</Popover>
			) : null}
		</span>
	);
}

/** One of a few values, as the registry names them or as `name` says them. */
export function Choice({
	choices,
	value,
	label,
	size = "sm",
	onChange,
	name = (choice) => choice,
}: {
	choices: readonly string[];
	value: string;
	label: string;
	size?: "sm" | "md";
	onChange: (next: string) => void;
	/** what a choice reads as, where that isn't the value itself */
	name?: (choice: string) => string;
}) {
	return (
		<SegmentedControl label={label} size={size} value={value} onValueChange={onChange}>
			{choices.map((choice) => (
				<Segment key={choice} value={choice}>
					{name(choice)}
				</Segment>
			))}
		</SegmentedControl>
	);
}
