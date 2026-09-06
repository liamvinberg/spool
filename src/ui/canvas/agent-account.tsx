import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentLoginProgress } from "../../daemon/agent-engine";
import { accountOperation, fetchAgentLogin } from "../api";
import { cn } from "../cn";
import { MenuItem } from "./context-menu";

/** The compact account surface; secrets live only in its input until submitted. */
export function AgentAccountDialog({
	project,
	onClose,
	onConnected,
}: {
	project: string;
	onClose: () => void;
	onConnected: () => void;
}) {
	const [view, setView] = useState<AgentLoginProgress | null>(null);
	const [connected, setConnected] = useState(false);
	const [value, setValue] = useState("");
	const [saving, setSaving] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const active = useRef<string | undefined>(undefined);
	const generation = useRef(0);
	const title =
		view === null
			? "Connect an account"
			: view.kind === "connected"
				? "OpenAI connected"
				: view.kind === "cancelled"
					? "Sign-in canceled"
					: "Connect OpenAI";
	useEffect(() => {
		const previous = document.activeElement;
		ref.current?.focus();
		void fetchAgentLogin(project, "spool").then((account) => setConnected(account?.signedIn === true));
		return () => {
			generation.current += 1;
			if (active.current !== undefined) void accountOperation(project, { action: "cancel", id: active.current });
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, [project]);
	useEffect(() => {
		if (view?.kind === "input") ref.current?.querySelector("input")?.focus();
		else ref.current?.focus();
	}, [view]);
	const cancel = () => {
		generation.current += 1;
		if (active.current !== undefined) void accountOperation(project, { action: "cancel", id: active.current });
		active.current = undefined;
		setValue("");
		setView({ kind: "cancelled" });
	};
	const begin = async () => {
		const at = ++generation.current;
		const result = await accountOperation(project, { action: "start", provider: "openai", method: "api_key" });
		if (at !== generation.current) {
			if ("id" in result) void accountOperation(project, { action: "cancel", id: result.id });
			return;
		}
		active.current = "id" in result ? result.id : undefined;
		setView(result);
	};
	const submit = async () => {
		if (view?.kind !== "input" || !value.trim() || saving) return;
		const at = generation.current;
		setSaving(true);
		const result = await accountOperation(project, { action: "input", id: view.id, value });
		setValue("");
		setSaving(false);
		active.current = undefined;
		if (at !== generation.current) return;
		setView(result);
		if (result.kind === "connected") {
			setConnected(true);
			onConnected();
		}
	};
	return createPortal(
		<>
			<div className="fixed inset-0 z-50 bg-bg/55">
				<button
					type="button"
					tabIndex={-1}
					aria-label="Dismiss account dialog"
					className="absolute inset-0 cursor-default"
					onClick={onClose}
					disabled={saving}
				/>
			</div>
			<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-8">
				<div
					ref={ref}
					role="dialog"
					aria-modal="true"
					aria-label="Connect an account"
					tabIndex={-1}
					data-account-look="list"
					className="pointer-events-auto max-h-[calc(100%-128px)] w-[380px] outline-none"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							if (!saving) onClose();
						}
						if (event.key !== "Tab") return;
						const controls = [
							...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ??
								[]),
						];
						const first = controls[0];
						const last = controls.at(-1);
						if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
							event.preventDefault();
							last?.focus();
						} else if (
							!event.shiftKey &&
							(document.activeElement === last || document.activeElement === ref.current)
						) {
							event.preventDefault();
							first?.focus();
						}
					}}
				>
					<section className="flex min-w-0 flex-col rounded-lg border border-border-raised bg-raised">
						<div className="flex shrink-0 items-center justify-between gap-3 border-border-raised border-b px-5 py-4">
							<h2 className="font-medium text-md text-text leading-md">{title}</h2>
							<button
								type="button"
								aria-label="Close account connection"
								onClick={onClose}
								disabled={saving}
								className="-mr-1 flex h-5 w-5 items-center justify-center rounded-sm text-muted/60 hover:text-text"
							>
								<svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
									<path d="m3 3 6 6M9 3 3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
								</svg>
							</button>
						</div>
						{view === null ? (
							<>
								<p className="px-5 pt-4 pb-2 text-base text-muted leading-base">
									Connect an account with its API key.
								</p>
								<div className="flex flex-col px-2 pb-3">
									<MenuItem
										label={connected ? "OpenAI API key · connected" : "OpenAI API key"}
										onClick={() => {
											if (connected) setView({ kind: "connected" });
											else void begin();
										}}
									/>
								</div>
							</>
						) : (
							<>
								<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
									{view.kind === "input" ? (
										<label className="flex flex-col gap-2 text-base text-muted leading-base">
											{view.label}
											<input
												type="password"
												value={value}
												disabled={saving}
												onChange={(event) => setValue(event.target.value)}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														event.stopPropagation();
														void submit();
													}
												}}
												placeholder="Paste your API key"
												autoComplete="off"
												spellCheck={false}
												className="h-8 w-full min-w-0 rounded-sm border border-border-raised bg-surface px-2.5 font-mono text-xs text-text outline-none placeholder:text-muted/40 focus:border-muted"
											/>
										</label>
									) : (
										<p role="status" className="text-base text-muted leading-base">
											{view.kind === "connected"
												? "Its models are now available in the model menu."
												: view.kind === "error"
													? view.message
													: "Your account wasn’t connected. Your draft is still here."}
										</p>
									)}
								</div>
								<div className="flex shrink-0 items-center justify-end gap-2 border-border-raised border-t px-4 py-3">
									{view.kind === "connected" ? (
										<>
											<span className="mr-auto">
												<AccountButton
													onClick={() => {
														void accountOperation(project, {
															action: "disconnect",
															provider: "openai",
														}).then((result) => {
															if (result.kind === "error") setView(result);
															else {
																setConnected(false);
																setView(null);
																onConnected();
															}
														});
													}}
												>
													Disconnect
												</AccountButton>
											</span>
											<AccountButton primary onClick={onClose}>
												Done
											</AccountButton>
										</>
									) : (
										<>
											<span className="mr-auto">
												<AccountButton
													disabled={saving}
													onClick={() => {
														cancel();
														setView(null);
													}}
												>
													Back
												</AccountButton>
											</span>
											{view.kind === "input" ? (
												<>
													<AccountButton disabled={saving} onClick={cancel}>
														Cancel
													</AccountButton>
													<AccountButton
														primary
														disabled={saving || !value.trim()}
														onClick={() => {
															void submit();
														}}
													>
														{saving ? "Connecting…" : "Connect"}
													</AccountButton>
												</>
											) : (
												<>
													<AccountButton onClick={onClose}>Not now</AccountButton>
													<AccountButton
														primary
														onClick={() => {
															void begin();
														}}
													>
														Try again
													</AccountButton>
												</>
											)}
										</>
									)}
								</div>
							</>
						)}
					</section>
				</div>
			</div>
		</>,
		document.body,
	);
}
function AccountButton({
	children,
	onClick,
	primary = false,
	disabled = false,
}: {
	children: ReactNode;
	onClick: () => void;
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
