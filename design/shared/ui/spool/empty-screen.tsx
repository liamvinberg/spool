import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { useState } from "react";
import { EmptyState } from "shared/ui/spool/empty-state";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A registered project with nothing in it yet. The chrome is the same chrome —
 * rails, tool bar, the lot — because the project is open and real; only the
 * field is empty. The rails say so honestly rather than hiding.
 */

interface SpoolEmptyScreenProps {
	homeTarget?: string | undefined;
	/** the folder this canvas belongs to: the tab wears its name */
	project?: string | undefined;
}

export function SpoolEmptyScreen({ homeTarget, project = "untitled" }: SpoolEmptyScreenProps) {
	const [copied, setCopied] = useState(false);
	const path = `~/spool/${project}`;
	return (
		<SpoolShell activeTab={project} tabs={[project]} homeTarget={homeTarget} zoom="100%">
			<CanvasChrome pages={[]} tool="none">
				<div className="flex h-full flex-col items-center justify-center pb-20">
					<EmptyState icon={<SpoolMark className="text-thread" />} title="Your canvas is ready."
						description="Ask your agent here, or open this project with Claude Code or Codex and tell it what you’d like to design."
						className="max-w-[520px] px-8" actions={<div className="flex flex-wrap items-center justify-center gap-3">
							<code className="max-w-full select-text break-all font-mono text-xs text-muted">{path}</code>
							<button type="button" className="rounded-md border border-border-raised bg-surface px-3 py-2 text-sm hover:bg-raised"
								onClick={() => void navigator.clipboard.writeText(path).then(() => setCopied(true))}>{copied ? "Copied" : "Copy project path"}</button>
						</div>} />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
