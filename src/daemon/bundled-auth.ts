import { randomUUID } from "node:crypto";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AgentLoginProgress } from "./agent-engine";
import { BUNDLED_CONNECTIONS } from "./bundled-connections";
import type { BundledCredentialStore } from "./bundled-store";

interface Login {
	provider: string;
	controller: AbortController;
	view: AgentLoginProgress;
	revision: number;
	expires?: ReturnType<typeof setTimeout>;
	browser?: Extract<AuthEvent, { type: "auth_url" }>;
	answer?: { revision: number; accept(value: string): void; reject(): void };
}

/** Login callbacks and credentials stay in the shared host, including between HTTP requests. */
export class BundledAuth {
	private readonly logins = new Map<string, Login>();
	constructor(
		private readonly models: ModelRuntime,
		private readonly store: BundledCredentialStore,
	) {}
	async start(provider: string, method: string): Promise<AgentLoginProgress> {
		if (!BUNDLED_CONNECTIONS.some((item) => item.provider === provider && item.method === method))
			return { kind: "error", message: "Unsupported connection" };
		for (const [id, login] of this.logins) if (login.provider === provider) this.cancel(id);
		this.store.invalidate(provider);
		const id = randomUUID();
		const login: Login = {
			provider,
			controller: new AbortController(),
			revision: 0,
			view: { kind: "step", id, revision: 0, step: { type: "progress", message: "starting sign-in" } },
		};
		this.logins.set(id, login);
		login.expires = setTimeout(() => this.cancel(id), 15 * 60_000);
		login.expires.unref();
		void this.models
			.login(provider, method === "oauth" ? "oauth" : "api_key", {
				signal: login.controller.signal,
				notify: (step) => {
					if (login.controller.signal.aborted) return;
					if (step.type === "auth_url") login.browser = step;
					// A progress notification must not replace a prompt that still needs an answer.
					if (login.answer !== undefined) return;
					login.view = { kind: "step", id, revision: ++login.revision, step };
				},
				prompt: (prompt) =>
					this.prompt(
						id,
						login,
						method === "api_key" && prompt.type === "secret"
							? {
									...prompt,
									message:
										BUNDLED_CONNECTIONS.find((item) => item.provider === provider && item.method === method)
											?.label ?? prompt.message,
									placeholder: "Paste your API key",
								}
							: prompt,
					),
			})
			.then(() => {
				if (!login.controller.signal.aborted) login.view = { kind: "connected" };
			})
			.catch(() => {
				if (!login.controller.signal.aborted)
					login.view = { kind: "error", message: "Could not connect or save the account. Try again." };
			})
			.finally(() => {
				login.answer?.reject();
				delete login.answer;
			});
		return this.settle(id);
	}
	private prompt(id: string, login: Login, prompt: AuthPrompt): Promise<string> {
		const signal = AbortSignal.any([login.controller.signal, ...(prompt.signal ? [prompt.signal] : [])]);
		const { signal: _signal, ...step } = prompt;
		const revision = ++login.revision;
		login.view = {
			kind: "step",
			id,
			revision,
			step,
			...(step.type === "manual_code" && login.browser ? { browser: login.browser } : {}),
		};
		return new Promise((resolve, reject) => {
			const cleanup = () => {
				signal.removeEventListener("abort", abort);
				if (login.answer?.revision === revision) delete login.answer;
			};
			const abort = () => {
				cleanup();
				if (!login.controller.signal.aborted)
					login.view = {
						kind: "step",
						id,
						revision: ++login.revision,
						step: { type: "progress", message: "finishing sign-in" },
					};
				reject(new Error("Sign-in canceled"));
			};
			login.answer = {
				revision,
				reject: abort,
				accept: (value) => {
					if (step.type === "select" && !step.options.some((option) => option.id === value)) return;
					if (!value.trim() || value.length > 16_384) return;
					cleanup();
					login.view = {
						kind: "step",
						id,
						revision: ++login.revision,
						step: { type: "progress", message: "finishing sign-in" },
					};
					resolve(value);
				},
			};
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
		});
	}
	private async settle(id: string): Promise<AgentLoginProgress> {
		// Let synchronous provider prompts and saves settle, without holding an HTTP request for OAuth.
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
		return this.poll(id);
	}
	poll(id: string): AgentLoginProgress {
		return this.logins.get(id)?.view ?? { kind: "cancelled" };
	}
	async input(id: string, value: string, revision?: number): Promise<AgentLoginProgress> {
		const login = this.logins.get(id);
		if (login?.answer && (revision === undefined || login.answer.revision === revision)) login.answer.accept(value);
		return this.settle(id);
	}
	cancel(id: string): void {
		const login = this.logins.get(id);
		if (login === undefined) return;
		clearTimeout(login.expires);
		if (login.view.kind === "step") {
			login.controller.abort();
			this.store.invalidate(login.provider);
		}
		this.logins.delete(id);
	}
	async logout(provider: string): Promise<void> {
		if (!BUNDLED_CONNECTIONS.some((item) => item.provider === provider)) throw new Error("Unsupported connection");
		for (const [id, login] of this.logins) if (login.provider === provider) this.cancel(id);
		this.store.invalidate(provider);
		await this.models.logout(provider);
	}
	close(): void {
		for (const id of this.logins.keys()) this.cancel(id);
	}
}
