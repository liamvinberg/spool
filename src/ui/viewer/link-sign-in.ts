/**
 * Signing in on a link share's own host (spool#174): whoever holds the link signs in here to read and write its
 * comments, into a session for this host alone. The email code and the name step run against this host; Google runs
 * in a popup on spool.page, which hands back a one-time code that this page trades, with the verifier only it holds,
 * for the session: neither signs anyone in without the other. No passkey is offered. A people share's outsiders are signed in at spool.page already.
 */

/** Where a link share's host signs in, as its canvas names it. */
export interface ViewerLinkSignIn {
	code: string;
	resend: string;
	verify: string;
	name: string;
	exchange: string;
	signOut: string;
	/** Google's sign-in on spool.page for this host, to which the popup adds the challenge */
	google: string;
	/** spool.page's origin: the only one whose message hands back a code */
	origin: string;
}

/** Who signed in: their account and the name the team sees. */
export interface LinkSignedIn {
	id: string;
	name: string;
}

/** The name step: an account with no name yet gives one, prefilled from its address, before it is signed in. */
export interface NameStep {
	step: "name";
	name: string;
	/** what their comments head with while the field is empty */
	fallback: string;
	color: string;
}

export type SignInAnswer = { me: LinkSignedIn } | NameStep | { error: string; retryAfter?: number };

async function post(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
	try {
		const response = await fetch(url, {
			method: "POST",
			credentials: "same-origin",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify(body),
		});
		return { status: response.status, body: await response.json().catch(() => null) };
	} catch {
		return { status: 0, body: { error: "offline" } };
	}
}

/** One field of what spool.page answered, if it is an object that has it. */
function field(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null && key in value
		? Object.getOwnPropertyDescriptor(value, key)?.value
		: undefined;
}

function answerOf(body: unknown): SignInAnswer {
	if (typeof body !== "object" || body === null) return { error: "unavailable" };
	const me = field(body, "me");
	const id = field(me, "id");
	const myName = field(me, "name");
	if (typeof id === "string" && typeof myName === "string") return { me: { id, name: myName } };
	const step = field(body, "step");
	const name = field(body, "name");
	const fallback = field(body, "fallback");
	const color = field(body, "color");
	if (step === "name" && typeof name === "string" && typeof fallback === "string" && typeof color === "string")
		return { step: "name", name, fallback, color };
	const error = field(body, "error");
	const retryAfter = field(body, "retryAfter");
	return {
		error: typeof error === "string" ? error : "unavailable",
		...(typeof retryAfter === "number" ? { retryAfter } : {}),
	};
}

/** Send a six-digit code to this address: null once it is on its way, or why not. */
export async function askCode(signIn: ViewerLinkSignIn, email: string, again = false): Promise<string | null> {
	const sent = again ? await post(signIn.resend, {}) : await post(signIn.code, { email });
	if (sent.status >= 200 && sent.status < 300) return null;
	const answer = answerOf(sent.body);
	return "error" in answer ? answer.error : "unavailable";
}

/** The code typed: signed in, the name step, or why not. */
export async function verifyCode(signIn: ViewerLinkSignIn, code: string): Promise<SignInAnswer> {
	return answerOf((await post(signIn.verify, { code })).body);
}

/** The name given at the name step: signed in, or why not. */
export async function giveName(signIn: ViewerLinkSignIn, name: string): Promise<SignInAnswer> {
	return answerOf((await post(signIn.name, { name })).body);
}

/** Sign out of this host: its comments go with the session. */
export async function signOutHere(signIn: ViewerLinkSignIn): Promise<void> {
	await post(signIn.signOut, {});
}

/** A fresh verifier and its S256 challenge, base64url as spool.page checks them. */
export async function verifierPair(): Promise<{ verifier: string; challenge: string }> {
	const bytes = crypto.getRandomValues(new Uint8Array(48));
	const verifier = base64Url(bytes);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
	return { verifier, challenge: base64Url(digest) };
}

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/** The channel the popup's last page on this host hands the code back on, when Google cut it off from this page. */
export const SIGN_IN_CHANNEL = "spool-sign-in";

/** The code a message hands back, if it is the popup's. */
function handedCode(data: unknown): string | undefined {
	const code = field(data, "code");
	return field(data, "type") === "spool-signed-in" && typeof code === "string" ? code : undefined;
}

/**
 * Google, in a popup on spool.page: its last page hands a one-time code to this page, which trades it with the
 * verifier only it holds for this host's session. The code comes by a message from spool.page to this page alone
 * or, should Google's pages have cut the popup off from this one, by the popup going on to this host, whose page
 * hands it here over this origin's own channel. Resolves signed in, or with why not (`blocked` when the popup never
 * opened, `closed` when `cancel` put it down before a code came).
 */
export async function googleHere(signIn: ViewerLinkSignIn, cancel: AbortSignal): Promise<SignInAnswer> {
	const { verifier, challenge } = await verifierPair();
	const popup = window.open(
		`${signIn.google}&challenge=${encodeURIComponent(challenge)}`,
		"spool-sign-in",
		"popup,width=480,height=640",
	);
	if (popup === null) return { error: "blocked" };
	return new Promise((resolve) => {
		let traded = false;
		const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(SIGN_IN_CHANNEL);
		const stop = () => {
			window.removeEventListener("message", heard);
			channel?.close();
			cancel.removeEventListener("abort", cancelled);
		};
		const trade = async (code: string) => {
			if (traded) return;
			traded = true;
			stop();
			resolve(answerOf((await post(signIn.exchange, { code, verifier })).body));
		};
		const heard = (event: MessageEvent) => {
			if (event.origin !== signIn.origin) return;
			const code = handedCode(event.data);
			if (code !== undefined) void trade(code);
		};
		const cancelled = () => {
			if (traded) return;
			traded = true;
			stop();
			try {
				popup.close();
			} catch {
				// cut off from it already
			}
			resolve({ error: "closed" });
		};
		window.addEventListener("message", heard);
		channel?.addEventListener("message", (event: MessageEvent) => {
			const code = handedCode(event.data);
			if (code !== undefined) void trade(code);
		});
		cancel.addEventListener("abort", cancelled);
		if (cancel.aborted) cancelled();
	});
}
