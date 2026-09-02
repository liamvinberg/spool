import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

/**
 * The browser tab a played frame would open in.
 *
 * Every frame on the `play-tab` page draws it, so the four chrome proposals are
 * compared inside the same window rather than each one implying its own. It is
 * a representation, not a replica: two tabs, a toolbar, a URL. The two tabs are
 * the whole argument for the bare proposal — the canvas you came from is still
 * sitting one tab to the left, so closing this one is a real way home.
 *
 * The chrome is OS grey. Tidemark's page below it is Tidemark's, and spool's
 * chrome inside the page area is spool's tokens. Three surfaces, three owners,
 * never confusable.
 */

export const CHROME_H = 78;

export function PlayedTab({ title, url, children }: { title: string; url: string; children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#17171A] font-sans antialiased [font-synthesis:none]">
			<div className="flex h-[38px] shrink-0 items-end gap-1 px-2">
				<Tab label="spool" />
				<Tab label={title} active />
				<span className="mb-[9px] ml-1.5 text-[#6E6E73] text-md leading-none">+</span>
			</div>
			<div className="flex h-10 shrink-0 items-center gap-2.5 border-[#2A2A2E] border-b bg-[#202024] px-3">
				<Chevron className="text-[#4E4E54]" />
				<Chevron className="rotate-180 text-[#6E6E73]" />
				<Reload />
				<span className="ml-1 flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-md bg-[#161619] px-3">
					<Lock />
					<span className="truncate font-mono text-[#9A9AA0] text-xs leading-none">{url}</span>
				</span>
				<span className="flex items-center gap-[3px] pl-1">
					{[0, 1, 2].map((dot) => (
						<span key={dot} className="h-[3px] w-[3px] rounded-full bg-[#6E6E73]" />
					))}
				</span>
			</div>
			<div className="relative min-h-0 flex-1">{children}</div>
		</div>
	);
}

function Tab({ label, active = false }: { label: string; active?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-[30px] items-center gap-2 rounded-t-md px-3",
				active ? "max-w-[280px] bg-[#202024]" : "max-w-[200px] opacity-60",
			)}
		>
			<span className="h-2 w-[3px] shrink-0 bg-thread" />
			<span className="truncate text-[#C8C8CC] text-xs leading-none">{label}</span>
			<svg viewBox="0 0 10 10" className="h-2 w-2 shrink-0 text-[#7A7A80]" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
				<path d="M2 2 8 8M8 2 2 8" />
			</svg>
		</span>
	);
}

function Chevron({ className }: { className: string }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("h-4 w-4", className)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="m10 3.5-4.5 4.5 4.5 4.5" />
		</svg>
	);
}

function Reload() {
	return (
		<svg viewBox="0 0 16 16" className="h-4 w-4 text-[#6E6E73]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M9.4 3.25a5 5 0 1 1-3.1.05M8.4 1.5 6.3 3.3 8 5" />
		</svg>
	);
}

function Lock() {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-[#6E6E73]" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
			<rect x="2.5" y="5" width="7" height="5" rx="1.2" />
			<path d="M4.2 5V3.6a1.8 1.8 0 0 1 3.6 0V5" />
		</svg>
	);
}
