/**
 * Signing in on a link share's own host (spool#174): whoever holds the link signs in here to read and write its
 * comments, into a session for this host alone. The email code and the name step run against this host; Google runs
 * in a popup on spool.page, which hands back a one-time code that this page trades, with the verifier only it holds,
 * for the session. No passkey is offered. A people share's outsiders are signed in at spool.page already.
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

/** How often the dialog asks after its popup's code, should the popup have lost its way back here. */
const POLL_MS = 1500;
/** How long it asks after the popup closed: the code is handed over as it closes. */
const AFTER_CLOSE_MS = 4000;

/**
 * Google, in a popup on spool.page: the popup's last page hands its code to this page alone, which trades it with
 * the verifier for this host's session. Should Google's pages have cut the popup off from this one, the verifier
 * alone finds the code while the popup is open. Resolves signed in, or with why not (`closed` when the popup went
 * without signing in, `blocked` when it never opened).
 */
export async function googleHere(signIn: ViewerLinkSignIn): Promise<SignInAnswer> {
	const { verifier, challenge } = await verifierPair();
	const popup = window.open(
		`${signIn.google}&challenge=${encodeURIComponent(challenge)}`,
		"spool-sign-in",
		"popup,width=480,height=640",
	);
	if (popup === null) return { error: "blocked" };
	return new Promise((resolve) => {
		let done = false;
		let closedAt: number | null = null;
		const finish = (answer: SignInAnswer) => {
			if (done) return;
			done = true;
			window.removeEventListener("message", heard);
			clearInterval(poll);
			resolve(answer);
		};
		const trade = async (code?: string) => {
			const answer = answerOf(
				(await post(signIn.exchange, { verifier, ...(code === undefined ? {} : { code }) })).body,
			);
			if ("error" in answer && answer.error === "not_yet") return false;
			finish(answer);
			return true;
		};
		const heard = (event: MessageEvent) => {
			if (event.origin !== signIn.origin) return;
			const data: unknown = event.data;
			const type = field(data, "type");
			const code = field(data, "code");
			if (type !== "spool-signed-in" || typeof code !== "string") return;
			void trade(code);
		};
		window.addEventListener("message", heard);
		const poll = setInterval(() => {
			if (done) return;
			if (popup.closed) closedAt ??= Date.now();
			if (closedAt !== null && Date.now() - closedAt > AFTER_CLOSE_MS) return finish({ error: "closed" });
			void trade();
		}, POLL_MS);
	});
}
