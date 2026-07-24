import { useState } from "react";
import { SlimIdle, SlimInspector } from "../../../shared/ui/inspector-slim";
import { byName, CanvasScene, type FrameNode, PageTree, type PageName } from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Shell rework — slim persistent rail. Same split as split-inspector: left tree
 * is the pure page switcher, right rail is the selection inspector. The rail is
 * stripped to its honest weight: idle is one quiet line, identity is a single
 * line, actions are inline glyphs, and a selection reads as just the connections
 * list. The dashboard, stat tiles and busiest-frames list are gone. This isolates
 * the one question — is a lean rail lighter than the element inspector, without
 * losing what the inspector is for.
 */

export default function ShellReworkInspectorSlim() {
	const [activePage, setActivePage] = useState<PageName>("session");
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<PageName, boolean>>({
		session: true,
		dialogs: false,
		tools: false,
		gates: false,
	});

	const switchPage = (page: PageName) => {
		setActivePage(page);
		setSelected(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const selectFrame = (name: string) => {
		const page = byName(name).page;
		setActivePage(page);
		setSelected(name);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const jump = (target: FrameNode) => selectFrame(target.name);

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%">
			<div className="flex h-full min-h-0">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<span className="font-semibold text-base leading-base">Pages</span>
						<span className="font-mono text-muted text-xs leading-xs">{4}</span>
					</div>
					<PageTree
						activePage={activePage}
						expanded={expanded}
						selected={selected}
						onTogglePage={(page) => setExpanded((cur) => ({ ...cur, [page]: !cur[page] }))}
						onSwitchPage={switchPage}
						onSelectFrame={selectFrame}
					/>
					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						folder switches page
					</div>
				</aside>

				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" onClick={() => setSelected(null)}>
					<CanvasScene page={activePage} selected={selected} onSelectFrame={selectFrame} />
					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · {activePage}
					</div>
				</div>

				<aside className="flex w-[300px] shrink-0 flex-col border-border border-l bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
						<span className="font-medium text-base text-text leading-none">Selection</span>
						{selected ? <span className="font-mono text-2xs text-muted leading-3">frame</span> : null}
					</div>
					{selected ? <SlimInspector selected={selected} onJump={jump} /> : <SlimIdle />}
				</aside>
			</div>
		</SpoolShell>
	);
}
