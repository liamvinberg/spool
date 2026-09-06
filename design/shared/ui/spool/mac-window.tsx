import { useState } from "react";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { SpoolShell } from "shared/ui/spool/shell";
import "./mac-window.css";

const projects = ["spool", "notaker v2", "inwall v2", "aria", "competitor study 2026-09-05", "kaffe", "kvitt", "solar", "mento", "origin-edits", "components", "components and interaction patterns"];

/** The shipped header with mock native controls; the body supplies canvas context. */
export function MacWindow({ state = "project" }: { state?: "project" | "home" | "crowded" }) {
	const [tabs, setTabs] = useState(() => projects.slice(0, state === "crowded" ? projects.length : 5));
	const [active, setActive] = useState<string | undefined>(state === "home" ? undefined : state === "crowded" ? "mento" : "spool");
	return (
		<div className="mac-window-frame h-full bg-bg p-6">
			<div className="mac-window relative h-full overflow-hidden rounded-xl border border-border-raised">
				<div className="mac-window-lights" aria-hidden="true"><i /><i /><i /></div>
				<SpoolShell tabs={tabs} activeTab={active} canvasControls={active !== undefined} zoom="72%"
					onFocus={setActive} onHome={() => setActive(undefined)} onReorder={(order) => setTabs([...order])}
					onClose={(name) => { setTabs((current) => current.filter((tab) => tab !== name)); if (active === name) setActive(undefined); }}
					onPick={() => { const name = projects.find((name) => !tabs.includes(name)) ?? `untitled-${tabs.length + 1}`; setTabs((current) => [...current, name]); setActive(name); }}>
					<div className="mac-window-body h-full">{active === undefined ? <SpoolHomeScreen /> : <SpoolCanvasScreen variant="rest" />}</div>
				</SpoolShell>
			</div>
		</div>
	);
}
