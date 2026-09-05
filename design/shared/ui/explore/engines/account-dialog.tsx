import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { LOGIN_PROVIDERS, LoginPanel, type LoginPrototype } from "shared/ui/explore/engines/login-flow";
import { MenuItem } from "shared/ui/spool/context-menu";

export type AccountLook = "list" | "tabs" | "split";

/** Three account-dialog compositions of ExportDialog and SettingsSheet.
 * This exploration changes layout, never provider behavior or the login steps.
 */
export function AccountDialog({ login, look }: { login: LoginPrototype; look: AccountLook }) {
	const [method, setMethod] = useState(
		login.view?.kind === "step" && login.view.provider.step.type === "secret" ? "key" : "sign-in",
	);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const previous = document.activeElement;
		ref.current?.focus();
		return () => {
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => {
		if (look === "split" && login.view?.kind === "providers") login.begin(LOGIN_PROVIDERS[0]!);
	}, [look, login.view?.kind]);
	useEffect(() => {
		ref.current?.focus();
	}, [login.view]);
	const selected = login.view !== null && login.view.kind !== "providers" ? login.view.provider.id : "chatgpt";
	const choices = (
		<>
			<div
				role="tablist"
				aria-label="Connection method"
				className="flex h-10 shrink-0 items-stretch gap-6 border-border border-b px-6"
			>
				{[
					{ id: "sign-in", name: "Sign in" },
					{ id: "key", name: "API key" },
				].map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={method === tab.id}
						onClick={() => setMethod(tab.id)}
						className={cn(
							"relative flex items-center text-base leading-base transition-colors duration-150",
							method === tab.id ? "text-text" : "text-muted hover:text-text",
						)}
					>
						{tab.name}
						{method === tab.id ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
					</button>
				))}
			</div>
			<div role="tabpanel" className="flex flex-col px-3 py-4">
				<p className="px-3 pb-3 text-base text-muted leading-base">
					{method === "sign-in"
						? "Connect a subscription you already use."
						: "Connect an account with its API key."}
				</p>
				{LOGIN_PROVIDERS.filter((provider) => (provider.step.type === "secret") === (method === "key")).map(
					(provider) => (
						<MenuItem
							key={provider.id}
							label={provider.name}
							disabled={login.accounts.includes(provider.id)}
							onClick={() => login.begin(provider)}
						/>
					),
				)}
			</div>
		</>
	);
	return (
		<>
			<div
				className={cn(
					"fixed inset-0 z-50",
					look === "list" ? "bg-bg/55" : "animate-find-in bg-bg/48 backdrop-blur-[2px]",
				)}
			>
				<button
					type="button"
					tabIndex={-1}
					aria-label="Dismiss account dialog"
					className="absolute inset-0 cursor-default"
					onClick={login.close}
				/>
			</div>
			<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-8">
				<div
					ref={ref}
					role="dialog"
					aria-modal="true"
					aria-label="Connect an account"
					tabIndex={-1}
					data-account-look={look}
					className={cn(
						"pointer-events-auto max-h-[calc(100%-128px)] outline-none",
						look === "list"
							? "w-[380px]"
							: "flex animate-find-panel-in flex-col overflow-hidden rounded-lg border border-border-raised bg-surface",
						look === "tabs" && "w-[440px]",
						look === "split" && "w-[640px]",
					)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							login.close();
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
						} else if (!event.shiftKey && document.activeElement === last) {
							event.preventDefault();
							first?.focus();
						}
					}}
				>
					{look === "list" ? (
						<LoginPanel login={login} take="dialog" back />
					) : look === "tabs" ? (
						<LoginPanel login={login} take="dialog" appearance="sheet" choices={choices} back />
					) : (
						<>
							<SheetHeading onClose={login.close}>Connect an account</SheetHeading>
							<div className="flex min-h-[340px] min-w-0">
								<div className="flex w-[208px] shrink-0 flex-col gap-0.5 border-border border-r p-2">
									{LOGIN_PROVIDERS.map((provider, index) => (
										<div
											key={provider.id}
											className={cn("flex flex-col rounded-sm", selected === provider.id && "bg-raised")}
											data-provider-selected={selected === provider.id ? provider.id : undefined}
										>
											{index === 2 ? <div className="mx-3 my-2 h-px bg-border" /> : null}
											<MenuItem
												label={provider.step.type === "secret" ? provider.label : provider.name}
												disabled={login.accounts.includes(provider.id)}
												onClick={() => login.begin(provider)}
											/>
										</div>
									))}
								</div>
								<div className="flex min-w-0 flex-1 flex-col">
									<LoginPanel login={login} take="dialog" appearance="inset" />
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
}

/** The shipped Settings / Shortcuts heading, also used by the model specimen. */
export function SheetHeading({ children, onClose }: { children: ReactNode; onClose: () => void }) {
	return (
		<header className="flex h-12 shrink-0 items-center justify-between border-border border-b px-6">
			<h2 className="font-semibold text-md text-text tracking-tight leading-md">{children}</h2>
			<button
				type="button"
				onClick={onClose}
				aria-label="Close dialog"
				className="font-mono text-2xs text-muted leading-3 hover:text-text"
			>
				esc closes
			</button>
		</header>
	);
}
