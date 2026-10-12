/** A Mac signed in as the account: its device session at spool.page. Times are Unix seconds. */
export interface AccountMac {
	id: string;
	name: string;
	signedInAt: number;
	usedAt: number;
}

export interface AccountPasskey {
	id: string;
	addedAt: number;
	usedAt: number | null;
}

/** What the account page shows: who is signed in, the Macs signed in as them and their passkeys. */
export interface AccountSummary {
	email: string;
	macs: AccountMac[];
	passkeys: AccountPasskey[];
}

/** Where the account page reads and changes the account: spool.page itself, with this browser's session. */
export interface AccountSource {
	/** null once this browser is signed out */
	summary(): Promise<AccountSummary | null>;
	revokeMac(id: string): Promise<void>;
	removePasskey(id: string): Promise<void>;
	/** Makes a passkey for spool.page in this browser and keeps it; throws when the person or the browser says no. */
	addPasskey(): Promise<void>;
	/** Whether this browser can make a passkey at all. */
	passkeys(): boolean;
}

interface Summary {
	email: string;
	devices: AccountMac[];
	passkeys: AccountPasskey[];
}

interface CreationOptions {
	challenge: string;
	rp: PublicKeyCredentialRpEntity;
	user: { id: string; name: string; displayName: string };
	pubKeyCredParams: PublicKeyCredentialParameters[];
	authenticatorSelection: AuthenticatorSelectionCriteria;
	attestation: AttestationConveyancePreference;
	excludeCredentials: { type: "public-key"; id: string }[];
	timeout: number;
}

/** The account routes at spool.page, on this page's own origin. */
export const cloudAccount: AccountSource = {
	async summary() {
		const response = await call("GET", "/account/summary");
		if (response.status === 401) return null;
		const summary = (await response.json()) as Summary;
		return { email: summary.email, macs: summary.devices, passkeys: summary.passkeys };
	},
	async revokeMac(id) {
		await call("POST", `/account/devices/${encodeURIComponent(id)}/revoke`);
	},
	async removePasskey(id) {
		await call("POST", `/account/passkeys/${encodeURIComponent(id)}/remove`);
	},
	async addPasskey() {
		const options = (await (await call("POST", "/account/passkeys/options", {})).json()) as CreationOptions;
		const credential = await navigator.credentials.create({
			publicKey: {
				...options,
				challenge: bytes(options.challenge),
				user: { ...options.user, id: bytes(options.user.id) },
				excludeCredentials: options.excludeCredentials.map((each) => ({ ...each, id: bytes(each.id) })),
			},
		});
		if (!(credential instanceof PublicKeyCredential)) throw new Error("no_passkey");
		const response = credential.response as AuthenticatorAttestationResponse;
		await call("POST", "/account/passkeys", {
			id: credential.id,
			clientDataJSON: base64Url(response.clientDataJSON),
			attestationObject: base64Url(response.attestationObject),
		});
	},
	passkeys() {
		return typeof PublicKeyCredential !== "undefined" && navigator.credentials !== undefined;
	},
};

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
	const response = await fetch(path, {
		method,
		credentials: "same-origin",
		headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	if (!response.ok && response.status !== 401) throw new Error(`account ${response.status}`);
	return response;
}

function base64Url(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

function bytes(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
}
