import { useEffect, useState } from "react";
import type { Harness } from "../../outside/harness";
import { fetchOutsideHarnesses, type OutsideHarness, postOutside } from "../api";
import { SeeChange } from "../canvas/outside";
import { Button } from "../primitives/actions";
import { SettingLine } from "./parts";

const NAMES: Record<Harness, string> = { claude: "Claude Code", codex: "Codex", pi: "pi" };

/**
 * Agents run in a terminal, connected or not (task 531): the place the ask's "Settings can
 * connect it any time" points at. Each connects for every project on this machine, and
 * takes out exactly what it added.
 */
export function OutsideRows() {
	const [all, setAll] = useState<OutsideHarness[] | null>(null);
	const read = () => void fetchOutsideHarnesses().then(setAll);
	useEffect(read, []);
	if (all === null || all.length === 0) return null;
	return (
		<>
			<h2 className="pt-8 pb-2 text-primary type-title">Agents in your terminal</h2>
			<p className="max-w-dialog pb-2 text-secondary type-label">
				Connected, an agent you run in a terminal shows on the canvas while it works on a project here. spool only
				listens: the agent's context and speed stay as they are.
			</p>
			<div className="flex flex-col border-line-default border-b">
				{all.map((one) => (
					<OutsideRow key={one.harness} about={one} onChanged={read} />
				))}
			</div>
		</>
	);
}

function OutsideRow({ about, onChanged }: { about: OutsideHarness; onChanged: () => void }) {
	const [busy, setBusy] = useState(false);
	const [reason, setReason] = useState<string | undefined>();
	const [open, setOpen] = useState(false);
	const act = async () => {
		setBusy(true);
		const done = await postOutside(about.harness, about.connected ? "disconnect" : "connect");
		setBusy(false);
		setReason(done.ok ? undefined : done.error);
		onChanged();
	};
	return (
		<SettingLine
			label={NAMES[about.harness]}
			says={
				about.connected
					? about.harness === "codex"
						? "Connected. Codex runs its hooks once you trust them in /hooks."
						: "Connected."
					: "Not connected."
			}
			below={<SeeChange about={about} open={open} onOpen={setOpen} />}
			reason={reason}
			control={
				<Button size="sm" loading={busy} onClick={act}>
					{about.connected ? "Disconnect" : "Connect"}
				</Button>
			}
		/>
	);
}
