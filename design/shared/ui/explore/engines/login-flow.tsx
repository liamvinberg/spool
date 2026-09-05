import { useState } from "react";
import { cn } from "shared/lib/utils";
import { LoginButton, type LoginStep, LoginStepView } from "shared/ui/explore/engines/login-steps";
import { MenuItem } from "shared/ui/spool/context-menu";

export type LoginTake = "popover" | "rail" | "dialog";
export type LoginSeed =
	| "idle"
	| "providers"
	| "browser"
	| "device"
	| "key"
	| "canceled"
	| "renew"
	| "connected"
	| "manual"
	| "text"
	| "select"
	| "progress";
type Provider = { id: string; name: string; label: string; step: LoginStep };

// Fixture adapters. New compatible providers supply a name and login steps;
// LoginStepView never switches on a provider id. No URL is opened or key stored.
export const LOGIN_PROVIDERS: readonly Provider[] = [
	{
		id: "chatgpt",
		name: "ChatGPT",
		label: "Sign in with ChatGPT",
		step: {
			type: "auth_url",
			url: "https://auth.openai.com/",
			instructions: "Continue with ChatGPT in your browser, then return to spool.",
		},
	},
	{
		id: "grok",
		name: "Grok",
		label: "Sign in with Grok",
		step: {
			type: "device_code",
			verificationUri: "https://auth.x.ai/",
			userCode: "SPOOL-4826",
		},
	},
	...["OpenAI", "Anthropic", "Google", "xAI"].map(
		(name): Provider => ({
			id: name.toLowerCase(),
			name,
			label: `${name} API key`,
			step: {
				type: "secret",
				message: `${name} API key`,
				placeholder: "Paste your API key",
			},
		}),
	),
];
const CHATGPT = LOGIN_PROVIDERS[0]!;
const GROK = LOGIN_PROVIDERS[1]!;
const OPENAI = LOGIN_PROVIDERS[2]!;

type LoginView = { kind: "providers" } | { kind: "step" | "canceled" | "renew" | "connected"; provider: Provider };
function initial(seed: LoginSeed): LoginView | null {
	if (seed === "idle") return null;
	if (seed === "providers") return { kind: "providers" };
	if (seed === "canceled" || seed === "renew" || seed === "connected") return { kind: seed, provider: CHATGPT };
	if (seed === "browser") return { kind: "step", provider: CHATGPT };
	if (seed === "device") return { kind: "step", provider: GROK };
	if (seed === "key") return { kind: "step", provider: OPENAI };
	const steps: Record<"manual" | "text" | "select" | "progress", LoginStep> = {
		manual: {
			type: "manual_code",
			message: "Paste the code from your browser.",
			placeholder: "Authorization code",
		},
		text: {
			type: "text",
			message: "Account name",
			placeholder: "Your account",
		},
		select: {
			type: "select",
			message: "Choose an account.",
			options: [
				{ id: "personal", label: "Personal" },
				{ id: "work", label: "Work" },
			],
		},
		progress: { type: "progress", message: "finishing sign-in" },
	};
	return {
		kind: "step",
		provider: {
			id: "example",
			name: "Example provider",
			label: "Example provider",
			step: steps[seed],
		},
	};
}

export function useLoginPrototype(seed: LoginSeed = "idle", configured = true) {
	const [view, setView] = useState<LoginView | null>(() => initial(seed));
	const [accounts, setAccounts] = useState<readonly string[]>(configured || seed === "connected" ? ["chatgpt"] : []);
	const [opened, setOpened] = useState(seed === "browser" || seed === "device");
	const begin = (provider: Provider) => {
		setOpened(false);
		setView({ kind: "step", provider });
	};
	const complete = () => {
		if (view === null || view.kind !== "step") return;
		if (view.provider.id === "example") {
			setView(null);
			return;
		}
		setAccounts((all) => [...new Set([...all, view.provider.id])]);
		setView({ kind: "connected", provider: view.provider });
	};
	return {
		view,
		accounts,
		opened,
		begin,
		complete,
		open: () => setView({ kind: "providers" }),
		openBrowser: () => setOpened(true),
		close: () => {
			setView(null);
			setOpened(false);
		},
		cancel: () => {
			if (view !== null && view.kind === "step") setView({ kind: "canceled", provider: view.provider });
		},
		renew: () => {
			setAccounts((all) => all.filter((id) => id !== "chatgpt"));
			setView({ kind: "renew", provider: CHATGPT });
		},
	};
}

export type LoginPrototype = ReturnType<typeof useLoginPrototype>;

/** The same login content in three surfaces. Layout is the live decision. */
export function LoginPanel({ login, take }: { login: LoginPrototype; take: LoginTake }) {
	const { view } = login;
	if (view === null) return null;
	const title =
		view.kind === "providers"
			? "Connect an account"
			: view.kind === "renew"
				? `Reconnect ${view.provider.name}`
				: view.kind === "connected"
					? `${view.provider.name} connected`
					: view.kind === "canceled"
						? "Sign-in canceled"
						: `Connect ${view.provider.name}`;
	return (
		<section
			data-login-panel={take}
			aria-label={title}
			className={cn(
				"flex min-w-0 flex-col",
				take === "rail" ? "border-border border-b bg-bg" : "rounded-lg border border-border-raised bg-raised",
			)}
		>
			<div className="flex items-center justify-between gap-3 border-border-raised border-b px-5 py-4">
				<h2 className="font-medium text-md text-text leading-md">{title}</h2>
				<button
					type="button"
					aria-label="Close account connection"
					onClick={login.close}
					className="-mr-1 flex h-5 w-5 items-center justify-center rounded-sm text-muted/60 hover:text-text"
				>
					<svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
						<path d="m3 3 6 6M9 3 3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
					</svg>
				</button>
			</div>
			{view.kind === "providers" ? (
				<>
					<p className="px-5 pt-4 pb-2 text-base text-muted leading-base">Use a subscription or an API key.</p>
					<div className="flex flex-col px-2 pb-3">
						{LOGIN_PROVIDERS.map((provider, index) => (
							<div key={provider.id}>
								{index === 2 ? <div className="mx-3 my-2 h-px bg-border-raised" /> : null}
								<MenuItem
									label={
										login.accounts.includes(provider.id) ? `${provider.label} · connected` : provider.label
									}
									disabled={login.accounts.includes(provider.id)}
									onClick={() => login.begin(provider)}
								/>
							</div>
						))}
					</div>
				</>
			) : (
				<div className="px-5 py-4">
					{view.kind === "step" ? (
						<LoginStepView
							key={view.provider.id}
							step={view.provider.step}
							opened={login.opened}
							onOpen={login.openBrowser}
							onAnswer={login.complete}
						/>
					) : (
						<p role="status" className="text-base text-muted leading-base">
							{view.kind === "connected"
								? "Its models are now available in the model menu."
								: view.kind === "renew"
									? "ChatGPT refused the request. Sign in again to continue this thread. Your messages and draft are still here."
									: "Your account wasn’t connected. Your draft is still here."}
						</p>
					)}
				</div>
			)}
			{view.kind !== "providers" ? (
				<div className="flex items-center justify-end gap-2 border-border-raised border-t px-4 py-3">
					{view.kind === "step" ? (
						<LoginButton onClick={login.cancel}>Cancel</LoginButton>
					) : view.kind === "connected" ? (
						<LoginButton primary onClick={login.close}>
							Done
						</LoginButton>
					) : (
						<>
							<LoginButton onClick={login.close}>Not now</LoginButton>
							<LoginButton primary onClick={() => login.begin(view.provider)}>
								{view.kind === "renew" ? "Sign in again" : "Try again"}
							</LoginButton>
						</>
					)}
				</div>
			) : null}
		</section>
	);
}

/** Outside product chrome: deterministic stand-in for the provider callback. */
export function LoginSimulation({ login }: { login: LoginPrototype }) {
	const signing = login.view?.kind === "step";
	return (
		<div
			data-login-simulation=""
			className="absolute bottom-24 left-14 z-[60] flex flex-col items-start gap-2 font-mono text-2xs text-muted/50 leading-3"
		>
			<span>prototype · {login.view?.kind ?? "idle"}</span>
			{signing ? (
				<button type="button" onClick={login.complete} className="text-muted hover:text-text">
					Simulate successful sign-in
				</button>
			) : login.accounts.includes("chatgpt") ? (
				<button type="button" onClick={login.renew} className="text-muted hover:text-text">
					Simulate refused request
				</button>
			) : null}
		</div>
	);
}
