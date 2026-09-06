import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentLoginProgress } from "../../daemon/agent-engine";
import type { AgentRecovery } from "../../daemon/agent-events";
import type { AgentLogin } from "../../daemon/agent-preflight";
import { BUNDLED_CONNECTIONS } from "../../daemon/bundled-connections";
import { accountOperation, fetchAgentLogin } from "../api";
import { AccountButton } from "./agent-account-button";
import { LoginStepView } from "./agent-auth-step";
import { MenuItem } from "./context-menu";

/** The compact account surface; secrets live only in its input until submitted. */
export function AgentAccountDialog({
	project,
	onClose,
	onConnected,
	onAuthenticated,
	renewal,
}: {
	project: string;
	onClose: () => void;
	onConnected: () => void;
	onAuthenticated?: (provider: string, method: string) => void;
	renewal?: AgentRecovery | undefined;
}) {
	const [view, setView] = useState<AgentLoginProgress | null>(
		renewal?.offer
			? {
					kind: "error",
					message: `${renewal.account} refused the request. Sign in again to continue this thread. Your messages and draft are still here.`,
				}
			: null,
	);
	const [connections, setConnections] = useState<NonNullable<AgentLogin["connections"]>>([]);
	const [selected, setSelected] = useState<(typeof BUNDLED_CONNECTIONS)[number]>(
		BUNDLED_CONNECTIONS.find((connection) =>
			renewal?.offer?.startsWith(`spool/${connection.provider}/${connection.method}/`),
		) ?? BUNDLED_CONNECTIONS[0],
	);
	const [opened, setOpened] = useState(false);
	const [manual, setManual] = useState(false);
	const [actionTarget, setActionTarget] = useState<HTMLSpanElement | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const active = useRef<string | undefined>(undefined);
	const generation = useRef(0);
	const completed = useRef(-1);
	const [renew, setRenew] = useState(Boolean(renewal?.offer));
	const title = renew
		? `Reconnect ${selected.name}`
		: view === null
			? "Connect an account"
			: view.kind === "connected"
				? `${selected.name} connected`
				: view.kind === "cancelled"
					? "Sign-in canceled"
					: `Connect ${selected.name}`;
	const refresh = useCallback(() => {
		void fetchAgentLogin(project, "spool").then((account) => setConnections(account?.connections ?? []));
	}, [project]);
	const accept = useCallback(
		(result: AgentLoginProgress) => {
			active.current = "id" in result ? result.id : undefined;
			setView((previous) => {
				if (
					previous?.kind === "step" &&
					result.kind === "step" &&
					previous.id === result.id &&
					previous.revision > result.revision
				)
					return previous;
				return JSON.stringify(previous) === JSON.stringify(result) ? previous : result;
			});
			if (result.kind === "connected" && completed.current !== generation.current) {
				completed.current = generation.current;
				onAuthenticated?.(selected.provider, selected.method);
				refresh();
				onConnected();
			}
		},
		[refresh, onConnected, onAuthenticated, selected],
	);
	useEffect(() => {
		const previous = document.activeElement;
		ref.current?.focus();
		refresh();
		return () => {
			generation.current += 1;
			if (active.current !== undefined) void accountOperation(project, { action: "cancel", id: active.current });
			const target =
				previous instanceof HTMLElement && previous !== document.body && previous.isConnected
					? previous
					: document.querySelector<HTMLElement>('[data-agent-rail] button[aria-label="Choose engine and model"]');
			target?.focus();
		};
	}, [project, refresh]);
	useEffect(() => {
		if (view?.kind === "step" || manual) ref.current?.querySelector("input")?.focus();
		if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
	}, [view, manual]);
	useEffect(() => {
		if (view?.kind !== "step") return;
		let cancelled = false;
		const at = generation.current;
		const timer = setInterval(() => {
			void accountOperation(project, { action: "poll", id: view.id }).then((result) => {
				if (!cancelled && at === generation.current && active.current === view.id) accept(result);
			});
		}, 250);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [project, view, accept]);
	const cancel = () => {
		generation.current += 1;
		if (active.current !== undefined) void accountOperation(project, { action: "cancel", id: active.current });
		active.current = undefined;
		setView({ kind: "cancelled" });
	};
	const begin = async (connection = selected) => {
		setRenew(false);
		cancel();
		setSelected(connection);
		setOpened(false);
		setManual(false);
		const at = generation.current;
		const result = await accountOperation(project, {
			action: "start",
			provider: connection.provider,
			method: connection.method,
		});
		if (at !== generation.current) {
			if ("id" in result) void accountOperation(project, { action: "cancel", id: result.id });
			return;
		}
		accept(result);
	};
	const submit = async (value: string) => {
		if (view?.kind !== "step") return;
		const at = generation.current;
		const result = await accountOperation(project, { action: "input", id: view.id, revision: view.revision, value });
		if (at === generation.current) accept(result);
	};
	const step = view?.kind === "step" ? (view.browser && !manual ? view.browser : view.step) : undefined;
	const open = (target?: string) => {
		const url =
			target ??
			(step?.type === "auth_url"
				? step.url
				: step?.type === "device_code"
					? step.verificationUri
					: step?.type === "info"
						? step.links?.[0]?.url
						: undefined);
		if (url && /^https?:\/\//i.test(url)) {
			window.open(url, "_blank", "noopener,noreferrer");
			setOpened(true);
			// The SDK has already requested this next step; its callback remains live.
			if (view?.kind === "step" && view.browser && view.step.type === "manual_code") setManual(true);
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
							onClose();
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
									Use a subscription or an API key.
								</p>
								<div className="flex flex-col px-2 pb-3">
									{BUNDLED_CONNECTIONS.map((connection, index) => {
										const connected = connections.some(
											(item) => item.provider === connection.provider && item.method === connection.method,
										);
										return (
											<div key={`${connection.provider}/${connection.method}`} className="flex flex-col">
												{index === 2 ? <div className="mx-3 my-2 h-px bg-border-raised" /> : null}
												<MenuItem
													label={connected ? `${connection.label} · connected` : connection.label}
													onClick={() => {
														if (connected) {
															setSelected(connection);
															setView({ kind: "connected" });
														} else void begin(connection);
													}}
												/>
											</div>
										);
									})}
								</div>
							</>
						) : (
							<>
								<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
									{step ? (
										<LoginStepView
											key={view.kind === "step" ? `${view.id}/${view.revision}/${manual}` : ""}
											step={step}
											opened={opened}
											onOpen={open}
											onAnswer={(value) => {
												void submit(value);
											}}
											actionTarget={actionTarget}
										/>
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
															provider: selected.provider,
														}).then((result) => {
															if (result.kind === "error") setView(result);
															else {
																refresh();
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
													onClick={() => {
														if (view.kind === "step" && view.browser && manual) setManual(false);
														else {
															cancel();
															setView(null);
														}
													}}
												>
													Back
												</AccountButton>
											</span>
											{view.kind === "step" ? (
												<>
													<AccountButton onClick={cancel}>Cancel</AccountButton>
													<span ref={setActionTarget} data-login-action="" />
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
														{renew ? "Sign in again" : "Try again"}
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
