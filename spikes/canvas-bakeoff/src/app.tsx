// Canvas substrate bake-off for spool (ticket devosurf/spool#9).
// Two variants of the same scene — tldraw with custom chrome vs a home-built DOM canvas —
// switchable via ?variant=, judged against the Figma-feel checklist. Throwaway spike.

import { useState } from "react";
import { type Ticks, ChecklistPanel } from "./checklist";
import { Switcher, type VariantId, variants } from "./switcher";
import { VariantHome } from "./variant-home";
import { VariantTldraw } from "./variant-tldraw";

function readVariant(): VariantId {
	const v = new URLSearchParams(window.location.search).get("variant");
	return v && v in variants ? (v as VariantId) : "tldraw";
}

export function App() {
	const [variant, setVariant] = useState<VariantId>(readVariant);
	const [checklistOpen, setChecklistOpen] = useState(false);
	const [ticks, setTicks] = useState<Ticks>({});

	const onVariant = (v: VariantId) => {
		setVariant(v);
		const url = new URL(window.location.href);
		url.searchParams.set("variant", v);
		window.history.replaceState(null, "", url);
	};

	return (
		<div className="h-full w-full overflow-hidden">
			{variant === "tldraw" ? <VariantTldraw /> : <VariantHome />}
			<Switcher
				variant={variant}
				onVariant={onVariant}
				checklistOpen={checklistOpen}
				onToggleChecklist={() => setChecklistOpen((o) => !o)}
			/>
			{checklistOpen && (
				<ChecklistPanel
					ticks={ticks}
					onTick={(id, col) =>
						setTicks((t) => {
							const row = t[id] ?? { t: false, h: false };
							return { ...t, [id]: { ...row, [col]: !row[col] } };
						})
					}
					onClose={() => setChecklistOpen(false)}
				/>
			)}
		</div>
	);
}
