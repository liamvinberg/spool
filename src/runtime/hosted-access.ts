interface HostedAccessConfig {
	version: 1;
	checkPath: string;
	reopenPath: "/";
}

export interface HostedAccess {
	blocked(): boolean;
	check(): void;
}

/** Live authorization exists only when the trusted host injects its inert config. */
export function hostedAccess(host: Window, requestedFrame: string | undefined): HostedAccess {
	const node = document.getElementById("spool-hosted-access");
	if (node === null) return { blocked: () => false, check: () => {} };
	const config = parseConfig(node.textContent);
	if (config === undefined) return invalidAccess(host, requestedFrame);
	const nativeFetch = window.fetch.bind(window);
	let denied = false;
	let pending: Promise<void> | undefined;
	let panel: HTMLElement | undefined;

	const present = (title: string, description: string, confirmed: boolean) => {
		if (denied && !confirmed) return;
		denied ||= confirmed;
		panel?.remove();
		panel = document.createElement("section");
		panel.setAttribute("role", "alert");
		panel.setAttribute("data-publication-access", confirmed ? "denied" : "unavailable");
		Object.assign(panel.style, confirmed ? blockingStyle : noticeStyle);
		const heading = document.createElement("strong");
		heading.textContent = title;
		const copy = document.createElement("span");
		copy.textContent = description;
		const action = document.createElement("button");
		action.type = "button";
		action.textContent = confirmed ? "Reopen" : "Retry";
		action.onclick = confirmed
			? () => {
					const target = new URL(config.reopenPath, host.location.origin);
					const currentFrame = new URL(host.location.href).searchParams.get("frame") ?? requestedFrame;
					if (currentFrame !== undefined) target.searchParams.set("frame", currentFrame);
					host.location.assign(target);
				}
			: () => check();
		panel.append(heading, copy, action);
		document.body.append(panel);
	};

	const run = async () => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		try {
			const response = await nativeFetch(config.checkPath, {
				credentials: "same-origin",
				cache: "no-store",
				redirect: "error",
				signal: controller.signal,
			});
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				body = undefined;
			}
			if (response.status === 200 && validActive(body)) {
				if (!denied) panel?.remove();
				return;
			}
			const code = errorCode(body);
			if (response.status === 401 && code === "session_required")
				present("Your session expired", "Reopen this prototype to sign in again.", true);
			else if (response.status === 403 && code === "access_removed")
				present("Access removed", "You no longer have access to this prototype.", true);
			else if (response.status === 410 && code === "publication_stopped")
				present("This prototype is no longer shared", "Ask its owner if you still need access.", true);
			else if (response.status === 410 && code === "visit_expired")
				present("This visit expired", "Reopen the prototype to start a new visit.", true);
			else
				present(
					"Access could not be checked",
					"The website is still available. Check your connection or retry.",
					false,
				);
		} catch {
			present(
				"Access could not be checked",
				"The website is still available. Check your connection or retry.",
				false,
			);
		} finally {
			clearTimeout(timeout);
		}
	};
	function check() {
		if (denied || pending !== undefined) return;
		pending = run().finally(() => {
			pending = undefined;
		});
	}
	check();
	setInterval(() => {
		if (document.visibilityState === "visible") check();
	}, 60_000);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") check();
	});
	return { blocked: () => denied, check };
}

function parseConfig(text: string | null): HostedAccessConfig | undefined {
	try {
		const value: unknown = JSON.parse(text ?? "");
		if (typeof value !== "object" || value === null || Array.isArray(value)) return;
		const record = value as Record<string, unknown>;
		if (Object.keys(record).sort().join(",") !== "checkPath,reopenPath,version") return;
		if (record.version !== 1 || record.reopenPath !== "/" || typeof record.checkPath !== "string") return;
		const check = new URL(record.checkPath, location.origin);
		if (
			check.origin !== location.origin ||
			check.username !== "" ||
			check.password !== "" ||
			check.hash !== "" ||
			!validCheckPath(check)
		)
			return;
		return { version: 1, checkPath: `${check.pathname}${check.search}`, reopenPath: "/" };
	} catch {
		return;
	}
}

function validCheckPath(check: URL): boolean {
	const keys = [...check.searchParams.keys()].sort().join(",");
	if (check.pathname === "/_spool/access")
		return keys === "visit" && /^[-_A-Za-z0-9]{16,512}$/u.test(check.searchParams.get("visit") ?? "");
	if (check.pathname !== "/_spool/public-access" || keys !== "generation,version") return false;
	const generation = check.searchParams.get("generation") ?? "";
	return (
		/^[1-9][0-9]*$/u.test(generation) &&
		Number.isSafeInteger(Number(generation)) &&
		/^[a-f0-9]{64}$/u.test(check.searchParams.get("version") ?? "")
	);
}

function invalidAccess(host: Window, frame: string | undefined): HostedAccess {
	queueMicrotask(() => {
		const panel = document.createElement("section");
		panel.setAttribute("role", "alert");
		panel.setAttribute("data-publication-access", "denied");
		Object.assign(panel.style, blockingStyle);
		const title = document.createElement("strong");
		title.textContent = "This hosted prototype could not verify access";
		const reopen = document.createElement("button");
		reopen.type = "button";
		reopen.textContent = "Reopen";
		reopen.onclick = () => {
			const target = new URL("/", host.location.origin);
			if (frame !== undefined) target.searchParams.set("frame", frame);
			host.location.assign(target);
		};
		panel.append(title, reopen);
		document.body.append(panel);
	});
	return { blocked: () => true, check: () => {} };
}

function validActive(value: unknown): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		Object.keys(record).sort().join(",") === "active,expiresAt" &&
		record.active === true &&
		typeof record.expiresAt === "number" &&
		Number.isSafeInteger(record.expiresAt) &&
		record.expiresAt > Date.now() / 1000
	);
}

function errorCode(value: unknown): string | undefined {
	return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
		? value.error
		: undefined;
}

const blockingStyle = {
	position: "fixed",
	inset: "0",
	zIndex: "2147483647",
	display: "grid",
	placeContent: "center",
	gap: "12px",
	padding: "24px",
	background: "#161616",
	color: "#f0efed",
	font: "16px/1.5 system-ui",
	textAlign: "center",
} as const;
const noticeStyle = {
	position: "fixed",
	inset: "auto 16px 16px",
	zIndex: "2147483647",
	display: "flex",
	alignItems: "center",
	gap: "12px",
	padding: "12px 16px",
	background: "#161616",
	color: "#f0efed",
	border: "1px solid #555",
	font: "14px/1.5 system-ui",
} as const;
