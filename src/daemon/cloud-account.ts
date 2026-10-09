import { openInBrowser } from "../browser";
import { account, type CloudAccount, CloudSignedOut, cloudOrigin, login, logout } from "../cloud-auth";

/** What the foot of Home's sidebar shows. */
export type CloudAccountState =
	| { state: "signed-out" }
	| { state: "signing-in" }
	| {
			state: "signed-in";
			email: string;
			accountUrl: string;
			/** the account's id, which a team canvas tells its own placeholders from teammates' by (#378) */
			accountId?: string | undefined;
	  }
	/** Signed in as far as this Mac knows, but spool.page did not answer just now. */
	| { state: "unreachable" };

export interface CloudAccountServices {
	origin(): string;
	account(spoolDir: string): Promise<CloudAccount>;
	login(spoolDir: string, options: { open: (url: string) => void; signal: AbortSignal }): Promise<CloudAccount>;
	logout(spoolDir: string): Promise<unknown>;
	open(url: string): void;
}

/** How long Home may show the account it last read before asking spool.page again. */
const FRESH_MS = 60_000;

/**
 * The app's Sign in: the same browser handoff as `spool login`, held by the daemon so Home can show it
 * waiting, open the page again or cancel it, and sign this Mac out.
 */
export function createCloudAccount(options: {
	spoolDir: string;
	services?: CloudAccountServices;
	onChange: () => void;
	now?: () => number;
}) {
	const services = options.services ?? defaultServices();
	const now = options.now ?? Date.now;
	let pending: { cancel: AbortController; url: string | null } | null = null;
	let known: { account: CloudAccount; at: number } | null = null;

	const signedIn = (current: CloudAccount): CloudAccountState => ({
		state: "signed-in",
		email: current.email,
		accountUrl: new URL("/account", services.origin()).toString(),
		accountId: current.accountId,
	});

	async function read(): Promise<CloudAccountState> {
		if (pending) return { state: "signing-in" };
		if (known && now() - known.at < FRESH_MS) return signedIn(known.account);
		try {
			known = { account: await services.account(options.spoolDir), at: now() };
			return signedIn(known.account);
		} catch (error) {
			known = null;
			return error instanceof CloudSignedOut ? { state: "signed-out" } : { state: "unreachable" };
		}
	}

	function signIn(): void {
		if (pending) return;
		const attempt = { cancel: new AbortController(), url: null as string | null };
		pending = attempt;
		void services
			.login(options.spoolDir, {
				signal: attempt.cancel.signal,
				open: (url) => {
					attempt.url = url;
					services.open(url);
				},
			})
			.then(
				(current) => {
					known = { account: current, at: now() };
				},
				() => {},
			)
			.finally(() => {
				if (pending === attempt) pending = null;
				options.onChange();
			});
		options.onChange();
	}

	return {
		read,
		signIn,
		/** The browser tab was closed or lost: open the same sign-in page again. */
		reopen(): boolean {
			if (!pending?.url) return false;
			services.open(pending.url);
			return true;
		},
		cancel(): void {
			pending?.cancel.abort();
		},
		/** `spool login` or `spool logout` changed the account outside this daemon: read it again. */
		changed(): void {
			known = null;
			options.onChange();
		},
		async signOut(): Promise<void> {
			pending?.cancel.abort();
			known = null;
			try {
				await services.logout(options.spoolDir);
			} finally {
				options.onChange();
			}
		},
	};
}

function defaultServices(): CloudAccountServices {
	const origin = () => cloudOrigin(process.env);
	return {
		origin,
		account: (spoolDir) => account(spoolDir, { origin: origin() }),
		login: (spoolDir, { open, signal }) => login(spoolDir, { origin: origin(), open, signal }),
		logout: (spoolDir) => logout(spoolDir, { origin: origin() }),
		open: (url) => openInBrowser(url),
	};
}
