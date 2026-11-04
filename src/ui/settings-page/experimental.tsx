import { useState } from "react";
import { EXPERIMENTS, type ExperimentEntry, type ExperimentId, experimentOfKey } from "../../settings/experiments";
import type { SettingReading } from "../../settings/registry";
import { experimentOn } from "../experiments";
import { Button } from "../primitives/actions";
import { SearchField } from "../primitives/inputs";
import { Switch } from "../primitives/selection";
import { FILES, Head, Says, SettingLine, type Write } from "./parts";

/**
 * Experimental (spool#423): one switch per feature still being tried, drawn
 * from `settings/experiments.ts` and nothing else, so a new experiment is a new
 * line and a graduated one is a line gone. Sorted by name and searched by
 * everything a line says, so the list reads the same at four or at forty.
 *
 * The canvas takes its experiments as it loads (`experiments.ts`), so a switch
 * moved here shows after a reload. Until then the head says so and offers one,
 * and only while what the file says differs from what this page booted with:
 * a switch put back where it was owes nothing.
 */

interface Line {
	readonly id: ExperimentId;
	readonly experiment: ExperimentEntry;
	readonly entry: SettingReading;
}

export function ExperimentalSection({ entries, write }: { entries: readonly SettingReading[]; write: Write }) {
	const [query, setQuery] = useState("");
	const lines = entries
		.flatMap((entry): Line[] => {
			const id = experimentOfKey(entry.key);
			return id === undefined ? [] : [{ id, experiment: EXPERIMENTS[id], entry }];
		})
		.sort((a, b) => a.experiment.name.localeCompare(b.experiment.name));
	const shown = lines.filter((line) => matches(line, query));
	const owed = lines.some((line) => Boolean(line.entry.value) !== experimentOn(line.id));
	return (
		<>
			<Head
				title="Experimental"
				file={owed ? `writes ${FILES.machine} · reload to apply` : `writes ${FILES.machine}`}
				aside={
					owed ? (
						<Button size="sm" onClick={() => window.location.reload()}>
							Reload canvas
						</Button>
					) : undefined
				}
			/>
			<SearchField
				size="md"
				hotkey=""
				placeholder="Search experiments"
				value={query}
				onValueChange={setQuery}
				className="mb-4"
			/>
			<div className="flex flex-col border-line-default border-b">
				{shown.map((line) => (
					<ExperimentRow key={line.id} line={line} write={write} />
				))}
				{shown.length === 0 ? (
					<p className="border-line-default border-t py-4 text-tertiary type-label">
						No experiment matches “{query.trim()}”.
					</p>
				) : null}
			</div>
			<p className="max-w-dialog pt-6 text-tertiary type-label">
				Each switch is a feature still being tried. The canvas reads them as it loads, so a change shows after a
				reload. A feature that graduates leaves this list and is simply on.
			</p>
		</>
	);
}

function ExperimentRow({ line, write }: { line: Line; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const { experiment, entry } = line;
	return (
		<SettingLine
			label={
				<>
					{experiment.name}
					{experiment.stage === "beta" ? <span className="ml-2 text-tertiary type-detail">beta</span> : null}
				</>
			}
			says={
				<>
					<Says text={experiment.says} />
					<span className="block text-tertiary">Trade-off: {experiment.tradeoff}</span>
				</>
			}
			reason={reason}
			control={
				<Switch
					checked={Boolean(entry.value)}
					aria-label={experiment.name}
					onCheckedChange={async (on) => {
						const written = await write(entry.key, on);
						setReason(written.ok ? undefined : written.reason);
					}}
				/>
			}
		/>
	);
}

/** Every word of the query somewhere in what the line says, its id and stage included. */
function matches({ id, experiment }: Line, query: string): boolean {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const text = [id, experiment.name, experiment.says, experiment.tradeoff, experiment.stage].join(" ").toLowerCase();
	return words.every((word) => text.includes(word));
}
