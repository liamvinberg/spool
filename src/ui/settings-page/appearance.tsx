import { useState, useSyncExternalStore } from "react";
import {
	APPEARANCES,
	type Appearance,
	parseThemeKey,
	type SettingKey,
	type SettingReading,
	THEME_LOOKS,
	THEME_TOKEN_NAMES,
	type ThemeLook,
	themeKey,
	themeTokens,
} from "../../settings/registry";
import { matchPreset, PRESETS, type ThemeSpec, themeWrites } from "../../settings/themes";
import { cn } from "../cn";
import { Button } from "../primitives/actions";
import {
	Choice,
	ColourControl,
	FILES,
	Head,
	LINE,
	Reason,
	SettingLine,
	ShareTheme,
	Swatches,
	ThemeChip,
	WindowPreview,
	type Write,
	type WriteMany,
} from "./parts";

/** The look the system is in, live, for `system` to follow. */
function useSystemLook(): ThemeLook {
	const query = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined);
	return useSyncExternalStore(
		(listen) => {
			const media = query();
			media?.addEventListener("change", listen);
			return () => media?.removeEventListener("change", listen);
		},
		() => (query()?.matches === false ? "light" : "dark"),
		() => "dark",
	);
}

/** The look in the file, and the one on screen now, which is the one an edit is about until another is picked. */
function useLooks(entries: readonly SettingReading[]) {
	const look = (entries.find((entry) => entry.key === "appearance")?.value as Appearance | undefined) ?? "dark";
	const system = useSystemLook();
	const shown: ThemeLook = look === "system" ? system : look;
	const [editing, setEditing] = useState<ThemeLook | null>(null);
	return { look, system, editLook: editing ?? shown, setEditing };
}

type Themed = SettingReading & { value: string };
const themedOf = (entries: readonly SettingReading[]) =>
	entries.filter((entry): entry is Themed => parseThemeKey(entry.key) !== undefined);

export function AppearanceSection({
	entries,
	write,
	writeMany,
}: {
	entries: readonly SettingReading[];
	write: Write;
	writeMany: WriteMany;
}) {
	const appearance = entries.find((entry) => entry.key === "appearance");
	const { look, system, editLook, setEditing } = useLooks(entries);
	const [preview, setPreview] = useState<ThemeSpec | null>(null);
	const [reason, setReason] = useState<string | undefined>();
	const tokens = themeTokens(entries, editLook);
	const current = matchPreset(editLook, tokens);
	const thread = themedOf(entries).find((entry) => entry.key === themeKey(editLook, "thread"));

	const setLook = async (next: Appearance) => {
		const written = await write("appearance", next);
		setReason(written.ok ? undefined : written.reason);
	};

	/**
	 * A theme into its look. Under a fixed look that is the other one, the look
	 * follows, since a theme nobody can see was not what was asked for; under
	 * `system` the theme waits for its look, which is the point of system.
	 */
	const apply = async (theme: ThemeSpec) => {
		const writes: { key: SettingKey; value: string }[] = themeWrites(theme);
		if (look !== "system" && look !== theme.appearance) writes.push({ key: "appearance", value: theme.appearance });
		const written = await writeMany(writes);
		setReason(written.ok ? undefined : written.reason);
		if (written.ok) setEditing(theme.appearance);
	};

	const shownName = preview?.name ?? current?.name ?? "Custom";
	return (
		<>
			<Head title="Appearance" file={`writes ${FILES.machine}`} />
			<figure className="flex flex-col gap-2 pb-6">
				<WindowPreview
					tokens={preview?.tokens ?? tokens}
					className="aspect-[16/7] w-full rounded-md border border-line-default"
				/>
				<figcaption className="flex items-center justify-between gap-4 text-tertiary type-detail">
					<span>
						<span className="text-secondary">{shownName}</span> · {editLook}
						{preview !== null && preview.name !== current?.name ? " · click applies" : ""}
					</span>
					{look === "system" ? <span>following the system: {system}</span> : null}
				</figcaption>
			</figure>
			<SettingLine
				label={appearance?.label ?? "Appearance"}
				says={`${appearance?.says ?? ""}${look === "system" ? ` The system is ${system} now.` : ""}`}
				reason={reason}
				control={
					<Choice
						choices={APPEARANCES}
						value={look}
						label="Appearance"
						size="md"
						onChange={(next) => void setLook(next as Appearance)}
					/>
				}
			/>
			<div className={cn(LINE, "flex flex-col gap-3")}>
				<div className="flex min-h-control-md items-center justify-between gap-4">
					<span className="flex items-center gap-2 text-primary type-control">
						Theme <span className="text-tertiary type-detail">for</span>
						<Choice
							choices={THEME_LOOKS}
							value={editLook}
							label="Theme for"
							onChange={(next) => setEditing(next as ThemeLook)}
						/>
					</span>
					<ShareTheme theme={{ name: current?.name ?? "Custom", appearance: editLook, tokens }} onPaste={apply} />
				</div>
				<div className="grid grid-cols-3 gap-2" onPointerLeave={() => setPreview(null)}>
					{PRESETS.filter((preset) => preset.appearance === editLook).map((preset) => (
						<ThemeChip
							key={preset.name}
							theme={preset}
							selected={current?.name === preset.name}
							onPick={() => void apply(preset)}
							onPreview={setPreview}
						/>
					))}
					{current === undefined ? (
						<ThemeChip
							theme={{ name: "Custom", appearance: editLook, tokens }}
							selected
							onPick={() => {}}
							onPreview={setPreview}
						/>
					) : null}
				</div>
				<p className="max-w-dialog text-secondary type-label">
					A theme is ten colours for one look. Pick one, or paste one somebody copied out of their spool.
				</p>
			</div>
			{thread === undefined ? null : <AccentLine key={thread.key} entry={thread} write={write} />}
			<p className="max-w-dialog border-line-default border-t pt-6 text-tertiary type-label">
				A theme dresses spool’s chrome. Your frames render in documents of their own, on their own tokens.css, and
				nothing chosen here reaches inside one.
			</p>
		</>
	);
}

/** The thread alone, first, because it is the colour most people mean by "spool in my colour". */
function AccentLine({ entry, write }: { entry: Themed; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const move = async (value: string | null) => {
		const written = await write(entry.key, value);
		setReason(written.ok ? undefined : written.reason);
	};
	return (
		<SettingLine
			label="Thread"
			says={entry.says}
			reason={reason}
			control={
				<Swatches
					settingKey={entry.key}
					value={entry.value}
					onSwatch={(hex) => void move(hex === entry.fallback ? null : hex)}
					onChange={(hex) => void move(hex)}
					onRefuse={setReason}
				/>
			}
		/>
	);
}

export function ColoursSection({
	entries,
	write,
	writeMany,
}: {
	entries: readonly SettingReading[];
	write: Write;
	writeMany: WriteMany;
}) {
	const { editLook, setEditing } = useLooks(entries);
	const [reason, setReason] = useState<string | undefined>();
	const themed = themedOf(entries);
	const moved = themed.filter((entry) => entry.source === "file");
	const movedHere = moved.filter((entry) => parseThemeKey(entry.key)?.look === editLook);
	const tokens = themeTokens(entries, editLook);

	// every moved token in both looks goes back as one write, as "Reset to spool’s" always has
	const reset = async () => {
		const written = await writeMany(moved.map((entry) => ({ key: entry.key, value: null })));
		setReason(written.ok ? undefined : written.reason);
	};

	return (
		<>
			<Head
				title="Colours"
				file={`writes ${FILES.machine}`}
				aside={
					<span className="flex items-center gap-2">
						<span className="text-tertiary type-detail">
							{THEME_TOKEN_NAMES.length + 1} tokens{movedHere.length === 0 ? "" : ` · ${movedHere.length} moved`}
						</span>
						<Choice
							choices={THEME_LOOKS}
							value={editLook}
							label="Colours for"
							onChange={(next) => setEditing(next as ThemeLook)}
						/>
						<Button size="sm" variant="ghost" disabled={moved.length === 0} onClick={() => void reset()}>
							Reset to spool’s
						</Button>
					</span>
				}
			/>
			<p className="max-w-dialog pb-4 text-secondary type-label">
				The interface’s own colours for the {editLook} look. The chrome is built on these, so they are the whole of
				what a theme can move.
			</p>
			{reason === undefined ? null : <Reason className="block pb-4">{reason}</Reason>}
			<div className="flex flex-col border-line-default border-b">
				{themed
					.filter((entry) => parseThemeKey(entry.key)?.look === editLook)
					.map((entry) => (
						<TokenRow key={entry.key} entry={entry} write={write} />
					))}
				<div className={ROW}>
					<span className="pl-0.5 text-tertiary type-detail">follows thread</span>
					<span className="text-primary type-value">mark</span>
					<span className="truncate text-secondary type-label">The ribbon in the corner.</span>
					<span
						className="size-control-xs justify-self-end rounded-xs border border-line-strong"
						style={{ background: tokens.thread }}
					/>
				</div>
			</div>
		</>
	);
}

const ROW =
	"grid min-h-row-roomy grid-cols-[136px_112px_minmax(0,1fr)_auto] items-center gap-3 border-line-default border-t";

function TokenRow({ entry, write }: { entry: Themed; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const move = async (value: string | null) => {
		const written = await write(entry.key, value);
		setReason(written.ok ? undefined : written.reason);
	};
	const moved = entry.source === "file";
	return (
		<div data-token={entry.key} className="flex flex-col">
			<div className={ROW}>
				<ColourControl
					settingKey={entry.key}
					value={entry.value}
					label={entry.label}
					lit={moved}
					onChange={(next) => void move(next)}
					onRefuse={setReason}
				/>
				<span className="text-primary type-value">{entry.label}</span>
				<span className="truncate text-secondary type-label">{entry.says}</span>
				{moved ? (
					<Button size="sm" variant="ghost" onClick={() => void move(null)}>
						reset
					</Button>
				) : (
					<span />
				)}
			</div>
			{reason === undefined ? null : <Reason className="pb-3">{reason}</Reason>}
		</div>
	);
}
