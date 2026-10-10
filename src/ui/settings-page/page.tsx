import { type ReactNode, useEffect, useState } from "react";
import type { SettingReading } from "../../settings/registry";
import { fetchCloudTeams } from "../api";
import { attachHotkeyLayer, type HotkeyHandler } from "../hotkey-dispatch";
import type { HotkeyIdFor } from "../hotkeys";
import { BackIcon, ColoursIcon, LookIcon, MachineIcon } from "../icons";
import { ProjectPicker } from "../picker";
import { Button } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { NavItem } from "../primitives/navigation";
import { Switch } from "../primitives/selection";
import { Panel, ScrollArea } from "../primitives/structure";
import { ProjectMark } from "../project-icon";
import { useSettings, useWriteSetting, useWriteSettings } from "../settings";
import type { TabProject } from "../tab-strip";
import { AppearanceSection, ColoursSection } from "./appearance";
import { Choice, ColourControl, FILES, Head, Says, SettingLine, type Write } from "./parts";

/**
 * Settings, as a place (#282): laid out the way Home is, a list of sections
 * where the pages pane stands and one section at a time on a measure beside it.
 * It stands in for the tab's content under the window bar and goes on esc or
 * Back, leaving the tab exactly as it was.
 *
 * Nothing about a setting is typed twice here. A line is its registry entry's
 * label, its `says` under it, and the control its shape names, so a new entry
 * is a new line with no change on this side. Each section names the file it
 * writes once, under its title, so the reach of a change reads off a filename.
 *
 * A write is the daemon's word or nothing: the control shows the file's value
 * until the reading comes back, and a refusal shows its reason under the line.
 * Nothing here is remembered in the browser, not the open section, not a draft.
 */

const UNTYPED = new Set(["checkbox", "radio"]);

export type SettingsSection = "project" | "machine" | "appearance" | "colours";

/** The sections there are: the project's only when opened from one. */
export function settingsSections(project: boolean): readonly SettingsSection[] {
	return project ? ["project", "machine", "appearance", "colours"] : ["machine", "appearance", "colours"];
}

export function SettingsPage({
	project,
	onClose,
	onMoveToTeam,
}: {
	/** the tab it was opened from; none on Home */
	project: TabProject | undefined;
	onClose: () => void;
	/** "Move to team…" for the open project, while it is only on this Mac and this account edits in a team. */
	onMoveToTeam?: (() => void) | undefined;
}) {
	const [section, setSection] = useState<SettingsSection>("machine");
	const snapshot = useSettings(project?.name);
	const write = useWriteSetting(project?.name);
	const writeMany = useWriteSettings(project?.name);
	// read during the first render, before the tab's content behind goes hidden and lets go of the focus
	const [returnTo] = useState(() => (typeof document === "undefined" ? null : document.activeElement));

	useEffect(() => {
		const detach = attachHotkeyLayer({
			scope: "settings",
			handlers: {
				"settings.close": (event) => {
					event?.preventDefault();
					onClose();
				},
			} satisfies Record<HotkeyIdFor<"settings">, HotkeyHandler>,
		});
		return detach;
	}, [onClose]);
	useEffect(
		() => () => {
			if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus({ preventScroll: true });
		},
		[returnTo],
	);

	const entries = snapshot?.entries ?? [];
	const shown = section === "project" && project === undefined ? "machine" : section;
	const sections: Record<SettingsSection, { name: string; icon: ReactNode }> = {
		project: {
			name: project?.name ?? "",
			icon:
				project === undefined ? null : (
					<ProjectMark project={project.name} name={project.name} icon={project.icon} team={project.teamAddress} />
				),
		},
		machine: { name: "This Mac", icon: <MachineIcon /> },
		appearance: { name: "Appearance", icon: <LookIcon /> },
		colours: { name: "Colours", icon: <ColoursIcon /> },
	};
	const back = project?.name ?? "Home";

	return (
		<section
			aria-label="Settings"
			className="absolute inset-0 flex animate-find-in bg-surface-window"
			onKeyDown={(event) => {
				// the dispatcher leaves every input's keys to it; a switch or a segment takes no text, so esc still goes
				const target = event.target;
				if (event.key === "Escape" && target instanceof HTMLInputElement && UNTYPED.has(target.type)) {
					event.preventDefault();
					onClose();
				}
			}}
		>
			<Panel side="start" width="rail" className="px-3 pt-3 pb-4">
				<NavItem
					icon={<BackIcon />}
					aria-label={`Back to ${back}`}
					label={
						<span className="flex items-center justify-between gap-2">
							<span className="truncate">Back to {back}</span>
							<Kbd>esc</Kbd>
						</span>
					}
					onClick={onClose}
				/>
				<h2 className="px-3 pt-6 pb-2 text-primary type-title">Settings</h2>
				<nav aria-label="Settings sections" className="flex flex-col gap-0.5">
					{settingsSections(project !== undefined).map((id) => (
						<NavItem
							key={id}
							data-section={id}
							icon={sections[id].icon}
							label={sections[id].name}
							current={shown === id}
							onClick={() => setSection(id)}
						/>
					))}
				</nav>
			</Panel>
			<ScrollArea className="min-w-0 flex-1">
				<div key={shown} className="w-full max-w-160 animate-find-in px-12 pt-10 pb-16">
					{snapshot === undefined ? null : shown === "project" && project !== undefined ? (
						<ProjectSection name={project.name} entries={entries} write={write} onMoveToTeam={onMoveToTeam} />
					) : shown === "machine" ? (
						<MachineSection entries={entries} write={write} />
					) : shown === "appearance" ? (
						<AppearanceSection entries={entries} write={write} writeMany={writeMany} />
					) : (
						<ColoursSection entries={entries} write={write} writeMany={writeMany} />
					)}
				</div>
			</ScrollArea>
		</section>
	);
}

/* ------------------------------------------------------------- sections -- */

function ProjectSection({
	name,
	entries,
	write,
	onMoveToTeam,
}: {
	name: string;
	entries: readonly SettingReading[];
	write: Write;
	onMoveToTeam?: (() => void) | undefined;
}) {
	const rows = entries.filter((entry) => entry.group === "general" && entry.scope === "project");
	return (
		<>
			<Head title={name} file={`writes ${FILES.project}`} />
			<div className="flex flex-col border-line-default border-b">
				{rows.map((entry) => (
					<SettingRow key={entry.key} entry={entry} write={write} />
				))}
				{onMoveToTeam === undefined ? null : (
					<SettingLine
						label="Team"
						says="Only on this Mac. Move it to a team to work on it live with your teammates."
						control={
							<Button size="sm" onClick={onMoveToTeam}>
								Move to team…
							</Button>
						}
					/>
				)}
			</div>
		</>
	);
}

function MachineSection({ entries, write }: { entries: readonly SettingReading[]; write: Write }) {
	const rows = entries.filter((entry) => entry.group === "general" && entry.scope === "machine");
	return (
		<>
			<Head title="This Mac" file={`writes ${FILES.machine}`} />
			<div className="flex flex-col border-line-default border-b">
				{rows.map((entry) => (
					<SettingRow key={entry.key} entry={entry} write={write} />
				))}
			</div>
			<p className="max-w-dialog pt-6 text-tertiary type-label">
				spool writes a file when something here moves, only the key that moved. Every other key in it is left the
				way you typed it.
			</p>
		</>
	);
}

/** One registry entry, as its shape draws it. */
function SettingRow({ entry, write }: { entry: SettingReading; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const [picking, setPicking] = useState(false);
	const move = async (value: boolean | string) => {
		const written = await write(entry.key, value);
		setReason(written.ok ? undefined : written.reason);
	};
	const shape = entry.shape;
	return (
		<SettingLine
			label={entry.label}
			says={<Says text={entry.says} />}
			reason={reason}
			control={
				shape.kind === "directory" ? (
					<>
						<span className="max-w-64 truncate text-secondary type-value" title={String(entry.value)}>
							{String(entry.value)}
						</span>
						<Button size="sm" onClick={() => setPicking(true)}>
							Change…
						</Button>
						{picking && (
							<ProjectPicker
								initial="location"
								location={String(entry.value)}
								onOpened={() => {}}
								onClose={() => setPicking(false)}
								onLocation={(path) => write(entry.key, path)}
							/>
						)}
					</>
				) : shape.kind === "boolean" ? (
					<Switch checked={Boolean(entry.value)} aria-label={entry.label} onCheckedChange={move} />
				) : shape.kind === "choice" ? (
					<Choice choices={shape.choices} value={String(entry.value)} label={entry.label} onChange={move} />
				) : shape.kind === "destination" ? (
					<DestinationControl value={String(entry.value)} label={entry.label} onChange={move} />
				) : (
					<ColourControl
						settingKey={entry.key}
						value={String(entry.value)}
						label={entry.label}
						onChange={move}
						onRefuse={setReason}
					/>
				)
			}
		/>
	);
}

/**
 * "New projects go to": ask, only this Mac, or one of the teams this Mac's account edits in. A team that isn't
 * offered any more (signed out, or left) still shows while it is the value, so the line never lies about the file.
 */
function DestinationControl({
	value,
	label,
	onChange,
}: {
	value: string;
	label: string;
	onChange: (next: string) => void;
}) {
	const [teams, setTeams] = useState<{ address: string; name: string }[]>([]);
	useEffect(() => {
		let live = true;
		void fetchCloudTeams().then((state) => {
			if (live && state.state === "ready") setTeams(state.teams.filter((team) => team.role !== "viewer"));
		});
		return () => {
			live = false;
		};
	}, []);
	const named = new Map([
		["ask", "Ask"],
		["local", "Only this Mac"],
		...teams.map((team) => [team.address, team.name] as const),
	]);
	if (!named.has(value)) named.set(value, value);
	return (
		<Choice
			choices={[...named.keys()]}
			value={value}
			label={label}
			onChange={onChange}
			name={(choice) => named.get(choice) ?? choice}
		/>
	);
}
