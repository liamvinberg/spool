import { type ReactNode, useState } from "react";
import { cn } from "shared/lib/utils";
import { MenuItem } from "shared/ui/spool/context-menu";
import { ModelRow } from "shared/ui/spool/model-control";

/** Throwaway renderers for pi 0.85.0 AuthEvent / AuthPrompt. No provider logic.
 * Source: pi/packages/ai/src/auth/types.ts at 17de82d7.
 * Buttons follow ExportDialog; choices are the existing ModelRow / MenuItem.
 */
export type LoginStep =
	| { type: "auth_url"; url: string; instructions: string }
	| { type: "device_code"; userCode: string; verificationUri: string }
	| { type: "progress"; message: string }
	| {
			type: "info";
			message: string;
			links?: readonly { url: string; label: string }[];
	  }
	| {
			type: "text" | "secret" | "manual_code";
			message: string;
			placeholder?: string;
	  }
	| {
			type: "select";
			message: string;
			options: readonly { id: string; label: string; description?: string }[];
	  };

export function LoginButton({
	children,
	onClick,
	primary = false,
	disabled = false,
}: {
	children: ReactNode;
	onClick?: () => void;
	primary?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex h-8 items-center justify-center rounded-sm px-3 text-base leading-none disabled:opacity-50",
				primary ? "bg-thread px-4 font-medium text-on-thread" : "text-muted hover:text-text",
			)}
		>
			{children}
		</button>
	);
}

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
}: {
	step: LoginStep;
	opened?: boolean;
	onOpen: () => void;
	onAnswer: (answer: string) => void;
}) {
	if (step.type === "auth_url")
		return (
			<div className="flex flex-col gap-4">
				<p className="text-base text-muted leading-base">{step.instructions}</p>
				<span className="truncate font-mono text-xs text-muted/60 leading-xs">{new URL(step.url).host}</span>
				<div className="flex">
					<LoginButton primary onClick={onOpen}>
						{opened ? "Open browser again" : "Open browser"}
					</LoginButton>
				</div>
				{opened ? <ProgressLine>waiting for sign-in</ProgressLine> : null}
			</div>
		);
	if (step.type === "device_code") return <DeviceStep step={step} opened={opened} onOpen={onOpen} />;
	if (step.type === "progress") return <ProgressLine>{step.message}</ProgressLine>;
	if (step.type === "info")
		return (
			<div className="flex flex-col gap-3">
				<p className="text-base text-muted leading-base">{step.message}</p>
				{step.links?.map((link) => (
					<MenuItem key={link.url} label={link.label} onClick={onOpen} />
				))}
			</div>
		);
	return <PromptStep key={`${step.type}:${step.message}`} step={step} onAnswer={onAnswer} />;
}

function DeviceStep({
	step,
	opened,
	onOpen,
}: {
	step: Extract<LoginStep, { type: "device_code" }>;
	opened: boolean;
	onOpen: () => void;
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
			<div className="flex">
				<LoginButton primary onClick={onOpen}>
					{opened ? "Open browser again" : "Open browser"}
				</LoginButton>
			</div>
			<ProgressLine>waiting for sign-in</ProgressLine>
		</div>
	);
}

function PromptStep({
	step,
	onAnswer,
}: {
	step: Extract<LoginStep, { type: "text" | "secret" | "manual_code" | "select" }>;
	onAnswer: (answer: string) => void;
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
					<ModelRow
						key={option.id}
						label={option.label}
						says={option.description}
						on={false}
						onPick={() => onAnswer(option.id)}
					/>
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
			<div className="flex">
				<LoginButton primary onClick={answer} disabled={!value.trim()}>
					{step.type === "secret" ? "Connect" : "Continue"}
				</LoginButton>
			</div>
		</div>
	);
}
