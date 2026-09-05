import { useState } from "react";
import {
	LINK,
	MODES,
	type MintStep,
	SCOPES,
	type ShareMode,
	type ShareScope,
	countOf,
	mintLog,
} from "shared/lib/explore/share/share-link";
import { cn } from "shared/lib/utils";
import { CheckIcon } from "shared/ui/spool/icons";
import { StateMark } from "shared/ui/spool/play-rail";

/**
 * Sharing a prototype: the dialog the frame's menu opens (spool-cloud#2, #10).
 *
 * Three moments, one box. You say how much of the project the link reaches and
 * whether it trails the canvas; spool compiles and uploads, printing what it
 * did in its own voice; and what you are left holding is a URL.
 *
 * Two things it refuses to hide. The scope is the link's, not the build's —
 * "This frame" still compiles the whole project, because a flow that crosses
 * frames cannot be sliced, and the copy says reach rather than size. And the
 * live/frozen choice is stated as what happens to the person on the other end
 * of it, since that is the only difference they will ever feel.
 */

export type ShareState = "scope" | "minting" | "ready";

export function ShareDialog({
	state,
	scope: seedScope = "flow",
	mode: seedMode = "live",
	copied: seedCopied = false,
	onCreate,
	onCancel,
	onOpen,
	onCopy,
}: {
	state: ShareState;
	scope?: ShareScope;
	mode?: ShareMode;
	/** the link already on the clipboard, for the state that shows what copying leaves behind */
	copied?: boolean;
	onCreate?: (() => void) | undefined;
	onCancel?: (() => void) | undefined;
	onOpen?: (() => void) | undefined;
	/** the frame's own clipboard write: shared UI takes the callback, never the runtime */
	onCopy?: ((text: string) => void) | undefined;
}) {
	const [scope, setScope] = useState<ShareScope>(seedScope);
	const [mode, setMode] = useState<ShareMode>(seedMode);
	const [copied, setCopied] = useState(seedCopied);
	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/55">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="share-dialog-title"
				className="w-[420px] rounded-lg border border-border-raised bg-raised"
			>
				<div className="flex items-center justify-between border-border-raised border-b px-5 py-4">
					<h2 id="share-dialog-title" className="font-medium text-md leading-md">
						{state === "ready" ? "cart is shared" : "Share cart"}
					</h2>
					<span className="font-mono text-muted text-xs leading-xs">
						{state === "ready" ? mode : "kaffe"}
					</span>
				</div>

				{state === "ready" ? (
					<Ready
						mode={mode}
						scope={scope}
						copied={copied}
						onCopy={() => {
							onCopy?.(`https://${LINK}`);
							setCopied(true);
						}}
					/>
				) : state === "minting" ? (
					<Minting steps={mintLog(scope)} />
				) : (
					<Choosing scope={scope} mode={mode} onScope={setScope} onMode={setMode} />
				)}

				<div className="flex items-center justify-between gap-2 border-border-raised border-t px-4 py-3">
					<p className="min-w-0 flex-1 text-muted text-xs leading-xs">
						{state === "ready"
							? mode === "live"
								? "Saves reach it. Stop sharing from the frame's menu."
								: "Sent at 14:02. Nothing you do next reaches it."
							: "Anyone with the link can open it and click through it. Nobody can edit."}
					</p>
					{state === "ready" ? (
						<button
							type="button"
							onClick={onOpen}
							className="flex h-8 shrink-0 cursor-pointer items-center rounded-sm border border-border-raised px-3 text-base text-text leading-none"
						>
							Open it
						</button>
					) : (
						<>
							<button
								type="button"
								onClick={onCancel}
								className="flex h-8 shrink-0 cursor-pointer items-center rounded-sm px-3 text-base text-muted leading-none"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={onCreate}
								className={cn(
									"flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-thread px-4 font-medium text-base text-on-thread leading-none",
									state === "minting" && "cursor-progress opacity-70",
								)}
							>
								{state === "minting" ? "Creating…" : "Create link"}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function Choosing({
	scope,
	mode,
	onScope,
	onMode,
}: {
	scope: ShareScope;
	mode: ShareMode;
	onScope: (next: ShareScope) => void;
	onMode: (next: ShareMode) => void;
}) {
	return (
		<>
			<Group label="What the link reaches">
				{SCOPES.map((option) => (
					<Choice
						key={option.scope}
						checked={scope === option.scope}
						label={option.label}
						detail={option.detail}
						trailing={countOf(option.scope)}
						onSelect={() => onScope(option.scope)}
					/>
				))}
			</Group>
			<Group label="How it keeps up">
				{MODES.map((option) => (
					<Choice
						key={option.mode}
						checked={mode === option.mode}
						label={option.label}
						detail={option.detail}
						onSelect={() => onMode(option.mode)}
					/>
				))}
			</Group>
		</>
	);
}

/**
 * The wait, said in the machine's register: three mono lines and a hairline
 * that fills. It is the one place the dialog admits there is a build, and it
 * admits it by naming what was built rather than by spinning at you.
 */
function Minting({ steps }: { steps: readonly MintStep[] }) {
	return (
		<div className="flex flex-col gap-3 px-5 py-5">
			<div className="flex flex-col gap-2.5">
				{steps.map((step) => (
					<div key={step.line} className="flex items-center gap-2.5">
						<StateMark state={step.state === "waiting" ? "pending" : step.state} />
						<span className={cn("font-mono text-sm leading-sm", step.state === "done" ? "text-muted" : "text-text")}>
							{step.line}
						</span>
					</div>
				))}
			</div>
			<div className="mt-1 h-px w-full bg-border-raised">
				<div className="h-px w-[62%] bg-thread" />
			</div>
		</div>
	);
}

function Ready({
	mode,
	scope,
	copied,
	onCopy,
}: {
	mode: ShareMode;
	scope: ShareScope;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 px-5 py-5">
			<div className="flex items-center gap-2">
				<span className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-border-raised bg-surface px-3 font-mono text-base text-text leading-none">
					<span className="truncate">{LINK}</span>
				</span>
				<button
					type="button"
					className={cn(
						"flex h-9 w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-md px-4 font-medium text-base leading-none",
						copied ? "bg-surface text-muted" : "bg-thread text-on-thread",
					)}
					onClick={onCopy}
				>
					{copied ? (
						<>
							<CheckIcon className="h-3 w-3" />
							Copied
						</>
					) : (
						"Copy link"
					)}
				</button>
			</div>
			<p className="font-mono text-muted text-xs leading-xs">
				{countOf(scope)} · {mode} · anyone with the link
			</p>
		</div>
	);
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1 border-border-raised border-b px-3 py-3">
			<span className="px-2 pb-1 font-mono text-2xs text-muted leading-none">{label}</span>
			{children}
		</div>
	);
}

function Choice({
	checked,
	label,
	detail,
	trailing,
	onSelect,
}: {
	checked: boolean;
	label: string;
	detail: string;
	trailing?: string;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={checked}
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-left",
				checked ? "border-thread bg-surface" : "border-transparent hover:bg-surface/60",
			)}
			onClick={onSelect}
		>
			<span
				className={cn(
					"mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
					checked ? "border-thread" : "border-muted",
				)}
			>
				{checked ? <span className="h-2 w-2 rounded-full bg-thread" /> : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-base leading-[16px]">{label}</span>
				<span className="text-muted text-xs leading-[15px]">{detail}</span>
			</span>
			{trailing === undefined ? null : (
				<span className="mt-[3px] shrink-0 font-mono text-muted text-xs leading-none">{trailing}</span>
			)}
		</button>
	);
}
