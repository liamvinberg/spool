import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { EASE } from "./marks";

/**
 * The 44px bar, as SpoolShell draws it, with two things the shipped strip cannot
 * do: a tab whose name is a field, and a tab that arrives as the card it was born
 * from. The right side is the focused project's: where it lives, who is in it.
 */

export interface BarTab {
	id: string;
	name: string;
}

export function Bar({
	tabs,
	active,
	naming,
	born,
	right,
	onHome,
	onFocus,
	onClose,
	onPlus,
	onRename,
	onNamed,
	onStartNaming,
}: {
	tabs: BarTab[];
	active: string | null;
	/** the tab whose name is being written */
	naming: string | null;
	/** the tab whose name flew up from a card, sharing its layoutId */
	born: string | null;
	right?: ReactNode;
	onHome: () => void;
	onFocus: (id: string) => void;
	onClose: (id: string) => void;
	onPlus: () => void;
	onRename: (id: string, name: string) => void;
	onNamed: () => void;
	onStartNaming: (id: string) => void;
}) {
	return (
		<header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']">
			<div className="flex h-full min-w-0 flex-1 items-center">
				<div className="relative mr-[12px] flex h-full shrink-0 items-center pr-[16px] after:absolute after:right-0 after:h-[18px] after:w-px after:bg-border-raised after:content-['']">
					<button
						type="button"
						className="flex h-[32px] cursor-pointer items-center gap-[9px] [padding:0_4px_0_6px] text-muted type-control hover:text-text aria-[current]:text-text"
						title="Home"
						aria-current={active === null ? "page" : undefined}
						onClick={onHome}
					>
						<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
							<path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
						</svg>
						<span>Home</span>
					</button>
				</div>
				<nav aria-label="Open projects" className="flex h-full min-w-0 items-center">
					<div className="relative z-[1] flex h-full min-w-0 items-center gap-[2px] px-[2px]">
						<AnimatePresence initial={false} mode="popLayout">
							{tabs.map((tab) => (
								<Tab
									key={tab.id}
									tab={tab}
									active={tab.id === active}
									naming={tab.id === naming}
									born={tab.id === born}
									onFocus={() => onFocus(tab.id)}
									onClose={() => onClose(tab.id)}
									onRename={(name) => onRename(tab.id, name)}
									onNamed={onNamed}
									onStartNaming={() => onStartNaming(tab.id)}
								/>
							))}
						</AnimatePresence>
					</div>
					<motion.button
						layout="position"
						type="button"
						className="relative ml-[6px] flex h-[30px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-muted hover:bg-[#ffffff06] hover:text-text"
						onClick={onPlus}
						title="New draft  ⌘N"
					>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
							<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
						</svg>
					</motion.button>
				</nav>
			</div>
			{right ? <div className="flex h-full shrink-0 items-center gap-[14px]">{right}</div> : null}
		</header>
	);
}

function Tab({
	tab,
	active,
	naming,
	born,
	onFocus,
	onClose,
	onRename,
	onNamed,
	onStartNaming,
}: {
	tab: BarTab;
	active: boolean;
	naming: boolean;
	born: boolean;
	onFocus: () => void;
	onClose: () => void;
	onRename: (name: string) => void;
	onNamed: () => void;
	onStartNaming: () => void;
}) {
	const nameId = born ? `sd-name-${tab.id}` : undefined;
	return (
		<motion.div
			layout="position"
			className="group/tab relative h-[36px] w-max min-w-[112px] max-w-[260px] shrink-0"
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, transition: { duration: 0.12 } }}
			transition={{ duration: 0.22, ease: EASE }}
		>
			{active && (
				<motion.div
					layoutId="sd-tab-selection"
					className="pointer-events-none absolute [inset:0_0_-4px] rounded-t-[8px] border border-border border-b-0 bg-canvas"
					transition={{ duration: 0.22, ease: EASE }}
				/>
			)}
			<div className="relative flex h-full items-center [padding:0_34px_0_12px]">
				{naming ? (
					<NameField name={tab.name} layoutId={nameId} onRename={onRename} onDone={onNamed} />
				) : (
					<button
						type="button"
						className={cn("flex h-full min-w-0 items-center type-control", active ? "text-text" : "text-muted hover:text-text")}
						onClick={onFocus}
						onDoubleClick={() => {
							onFocus();
							onStartNaming();
						}}
						title={active ? "Double-click to rename" : undefined}
					>
						<motion.span layoutId={nameId} className="truncate">
							{tab.name}
						</motion.span>
					</button>
				)}
			</div>
			<button
				type="button"
				className={cn(
					"absolute top-[6px] right-[4px] flex h-[24px] w-[24px] items-center justify-center rounded-[5px] text-muted hover:bg-[#ffffff12] hover:text-text",
					active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
				)}
				onClick={onClose}
				aria-label={`Close ${tab.name}`}
			>
				<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
				</svg>
			</button>
		</motion.div>
	);
}

/**
 * The name, written where the project is named everywhere else: its tab. It opens
 * selected, so typing replaces "untitled" and Enter or a click elsewhere keeps it.
 * The folder on disk takes the name with it, which is why a slash is refused.
 */
function NameField({ name, layoutId, onRename, onDone }: { name: string; layoutId: string | undefined; onRename: (name: string) => void; onDone: () => void }) {
	const [draft, setDraft] = useState(name);
	const [bad, setBad] = useState(false);
	const field = useRef<HTMLInputElement>(null);
	const kept = useRef(name);
	const cancelled = useRef(false);
	useEffect(() => {
		const input = field.current;
		if (input === null) return;
		input.focus();
		input.select();
	}, []);
	const commit = (value: string) => {
		if (cancelled.current) return;
		const next = value.trim();
		if (next === "" || next.startsWith(".") || /[/\\]/.test(next)) {
			setDraft(kept.current);
			onDone();
			return;
		}
		onRename(next);
		onDone();
	};
	return (
		<motion.span layoutId={layoutId} className="relative flex items-center">
			<input
				ref={field}
				aria-label="Project name"
				value={draft}
				spellCheck={false}
				aria-invalid={bad}
				className={cn(
					"-ml-[5px] h-[24px] min-w-[64px] max-w-[200px] rounded-[5px] bg-raised px-[5px] text-text outline-none type-control [field-sizing:content] selection:bg-[#ffffff2e]",
					bad && "[box-shadow:inset_0_0_0_1px_var(--color-thread)]",
				)}
				onChange={(event) => {
					setDraft(event.target.value);
					setBad(/[/\\]/.test(event.target.value) || event.target.value.startsWith("."));
				}}
				onBlur={(event) => commit(event.currentTarget.value)}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.nativeEvent.isComposing) return;
					if (event.key === "Enter") {
						event.preventDefault();
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						cancelled.current = true;
						setDraft(kept.current);
						onDone();
					}
				}}
			/>
			{bad && (
				<span className="absolute top-[30px] left-[-5px] z-30 whitespace-nowrap rounded-[6px] border border-border-raised bg-raised px-[8px] py-[4px] text-text type-caption">
					A name is a folder name, so it cannot hold a slash or start with a dot.
				</span>
			)}
		</motion.span>
	);
}
