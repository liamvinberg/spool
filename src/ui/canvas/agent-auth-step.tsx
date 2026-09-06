import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentAuthStep as LoginStep } from "../../daemon/agent-engine";
import { AccountButton } from "./agent-account-button";
import { MenuItem } from "./context-menu";

export function ProgressLine({ children }: { children: ReactNode }) {
	return (
		<p role="status" className="flex items-center gap-2 font-mono text-2xs text-muted leading-3">
			<span className="h-1 w-1 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
			{children}
		</p>
	);
}

export function LoginStepView({
	step,
	opened = false,
	onOpen,
	onAnswer,
	actionTarget = null,
}: {
	step: LoginStep;
	opened?: boolean;
	onOpen: (url?: string) => void;
	onAnswer: (answer: string) => void;
	actionTarget?: HTMLElement | null;
}) {
	if (step.type === "auth_url")
		return (
			<div className="flex flex-col gap-4">
				<p className="text-base text-muted leading-base">
					{step.instructions ?? "Complete sign-in in your browser, then return to spool."}
				</p>
				<span className="truncate font-mono text-xs text-muted/60 leading-xs">{new URL(step.url).host}</span>
				<Action target={actionTarget}>
					<AccountButton primary onClick={() => onOpen()}>
						{opened ? "Open browser again" : "Open browser"}
					</AccountButton>
				</Action>
				{opened ? <ProgressLine>waiting for sign-in</ProgressLine> : null}
			</div>
		);
	if (step.type === "device_code")
		return <DeviceStep step={step} opened={opened} onOpen={onOpen} actionTarget={actionTarget} />;
	if (step.type === "progress") return <ProgressLine>{step.message}</ProgressLine>;
	if (step.type === "info")
		return (
			<div className="flex flex-col gap-3">
				<p className="text-base text-muted leading-base">{step.message}</p>
				{step.links?.map((link) => (
					<MenuItem key={link.url} label={link.label ?? new URL(link.url).host} onClick={() => onOpen(link.url)} />
				))}
			</div>
		);
	return (
		<PromptStep key={`${step.type}:${step.message}`} step={step} onAnswer={onAnswer} actionTarget={actionTarget} />
	);
}

function DeviceStep({
	step,
	opened,
	onOpen,
	actionTarget,
}: {
	step: Extract<LoginStep, { type: "device_code" }>;
	opened: boolean;
	onOpen: (url?: string) => void;
	actionTarget: HTMLElement | null;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex flex-col gap-4">
			<p className="text-base text-muted leading-base">Enter this code in your browser to connect your account.</p>
			<div className="flex items-center justify-between rounded-sm border border-border-raised bg-surface px-3 py-2">
				<code className="font-mono text-md text-text leading-md">{step.userCode}</code>
				<button
					type="button"
					className="text-sm text-muted hover:text-text"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(step.userCode);
							setCopied(true);
						} catch {
							setCopied(false);
						}
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<span className="font-mono text-xs text-muted/60 leading-xs">{new URL(step.verificationUri).host}</span>
			<Action target={actionTarget}>
				<AccountButton primary onClick={() => onOpen()}>
					{opened ? "Open browser again" : "Open browser"}
				</AccountButton>
			</Action>
			<ProgressLine>waiting for sign-in</ProgressLine>
		</div>
	);
}

function PromptStep({
	step,
	onAnswer,
	actionTarget,
}: {
	step: Extract<LoginStep, { type: "text" | "secret" | "manual_code" | "select" }>;
	onAnswer: (answer: string) => void;
	actionTarget: HTMLElement | null;
}) {
	const [value, setValue] = useState("");
	const answer = () => {
		if (value.trim()) {
			onAnswer(value);
			setValue("");
		}
	};
	if (step.type === "select")
		return (
			<div className="flex flex-col gap-3">
				<p className="text-base text-muted leading-base">{step.message}</p>
				{step.options.map((option) => (
					<button
						key={option.id}
						type="button"
						onClick={() => onAnswer(option.id)}
						className="flex w-full min-w-0 flex-col gap-0.5 rounded-xs px-1.5 py-1 text-left text-text/70 transition-colors duration-150 hover:bg-surface/60"
					>
						<span className="min-w-0 flex-1 truncate font-mono text-xs leading-4">{option.label}</span>
						{option.description ? (
							<span className="line-clamp-2 w-full font-mono text-2xs text-muted/40 leading-[1.5]">
								{option.description}
							</span>
						) : null}
					</button>
				))}
			</div>
		);
	return (
		<div className="flex flex-col gap-4">
			<label className="flex flex-col gap-2 text-base text-muted leading-base">
				{step.message}
				<input
					type={step.type === "secret" ? "password" : "text"}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.stopPropagation();
							answer();
						}
					}}
					placeholder={step.placeholder}
					autoComplete="off"
					spellCheck={false}
					className="h-8 w-full min-w-0 rounded-sm border border-border-raised bg-surface px-2.5 font-mono text-xs text-text outline-none placeholder:text-muted/40 focus:border-muted"
				/>
			</label>
			<Action target={actionTarget}>
				<AccountButton primary onClick={answer} disabled={!value.trim()}>
					{step.type === "secret" ? "Connect" : "Continue"}
				</AccountButton>
			</Action>
		</div>
	);
}

/** Keep a step's input state with its action while the dialog owns placement. */
function Action({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
	return target === null ? <div className="flex">{children}</div> : createPortal(children, target);
}
