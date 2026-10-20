import { useEffect, useState } from "react";
import { Button } from "../primitives/actions";
import { TextAction } from "../primitives/feedback";
import { TextField } from "../primitives/inputs";
import { Dialog, DialogHeader, Popover, Scrim } from "../primitives/overlays";
import {
	askCode,
	giveName,
	googleHere,
	type LinkSignedIn,
	type NameStep,
	type SignInAnswer,
	type ViewerLinkSignIn,
	verifyCode,
} from "./link-sign-in";

/**
 * Signed out on a link share (spool#174): the frames open, the comments don't. The Comment tool, C, the Comments
 * button, the rail's Sign in and the one-time tip all open this one dialog: Google, or a six-digit code by email
 * and then the name step. Once signed in, what was reached for carries on.
 */

type Step = { kind: "email" } | { kind: "code"; email: string } | ({ kind: "name" } & NameStep);

/** What a refusal says in the dialog. */
function said(error: string): string {
	switch (error) {
		case "invalid_mailbox":
		case "invisible_characters":
			return "That isn't an email address.";
		case "invalid_code":
			return "That code isn't the one we sent. Try again.";
		case "too_many_attempts":
			return "Too many tries. Ask for a new code.";
		case "rate_limited":
		case "email_rate_limited":
			return "Too many codes just now. Wait a moment, then ask again.";
		case "invalid_name":
			return "A name is 1 to 60 characters.";
		case "blocked":
			return "Your browser blocked the Google window. Allow pop-ups here and try again.";
		case "closed":
			return "The Google window closed before you signed in.";
		case "offline":
			return "spool.page isn't answering. Check your connection.";
		default:
			return "That didn't work. Try again.";
	}
}

export function SignInDialog({
	signIn,
	by,
	onSignedIn,
	onClose,
}: {
	signIn: ViewerLinkSignIn;
	/** who shared the pages, as the dialog says whose team talks here */
	by: string;
	onSignedIn: (me: LinkSignedIn) => void;
	onClose: () => void;
}) {
	const [step, setStep] = useState<Step>({ kind: "email" });
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Esc puts the dialog down, as a click beside it does
	useEffect(() => {
		const down = (event: KeyboardEvent) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", down);
		return () => window.removeEventListener("keydown", down);
	}, [onClose]);
	const answered = (answer: SignInAnswer) => {
		setBusy(false);
		if ("me" in answer) return onSignedIn(answer.me);
		if ("step" in answer) {
			setName(answer.name);
			setError(null);
			return setStep({ kind: "name", ...answer });
		}
		setError(said(answer.error));
	};
	const google = () => {
		setBusy(true);
		setError(null);
		void googleHere(signIn).then(answered);
	};
	const sendCode = (again = false) => {
		if (email.trim() === "") return;
		setBusy(true);
		setError(null);
		void askCode(signIn, email.trim(), again).then((refused) => {
			setBusy(false);
			if (refused !== null) return setError(said(refused));
			setCode("");
			setStep({ kind: "code", email: email.trim() });
		});
	};
	const typed = (next: string) => {
		const digits = next.replace(/\D/gu, "").slice(0, 6);
		setCode(digits);
		if (digits.length !== 6) return;
		setBusy(true);
		setError(null);
		void verifyCode(signIn, digits).then(answered);
	};
	const named = () => {
		if (name.trim() === "") return;
		setBusy(true);
		void giveName(signIn, name.trim()).then(answered);
	};
	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center" data-viewer-sign-in={step.kind}>
			<Scrim label="Close" onClick={onClose} />
			<Dialog width="free" className="relative z-40 w-[380px]" aria-labelledby="viewer-sign-in-title">
				<DialogHeader
					titleId="viewer-sign-in-title"
					title="Sign in to see comments"
					description={`${by}'s team talks about these screens here. Viewing them needs no account; reading and leaving comments does.`}
				/>
				<div key={step.kind} className="flex animate-find-in flex-col gap-2.5 pt-5">
					{step.kind === "email" ? (
						<form
							className="flex flex-col gap-2.5"
							onSubmit={(event) => {
								event.preventDefault();
								sendCode();
							}}
						>
							<Button size="md" className="w-full" disabled={busy} onClick={google}>
								Continue with Google
							</Button>
							<div className="flex items-center gap-3 text-secondary type-detail">
								<span className="h-px flex-1 bg-line-default" />
								or
								<span className="h-px flex-1 bg-line-default" />
							</div>
							<TextField
								label="Email"
								placeholder="Email"
								value={email}
								onValueChange={setEmail}
								inputProps={{ type: "email", autoComplete: "email", autoFocus: true }}
							/>
							<Button
								size="md"
								variant="primary"
								type="submit"
								className="w-full"
								disabled={busy || email.trim() === ""}
							>
								Email me a code
							</Button>
						</form>
					) : step.kind === "code" ? (
						<>
							<span className="text-primary type-label">Enter the code sent to {step.email}.</span>
							<TextField
								size="lg"
								label="Code"
								placeholder="000000"
								mono
								value={code}
								onValueChange={typed}
								inputProps={{
									inputMode: "numeric",
									autoComplete: "one-time-code",
									autoFocus: true,
									className: "text-center tracking-[0.5em]",
								}}
							/>
							<span className="flex items-center gap-2">
								<TextAction className="-ml-1.5" onClick={() => setStep({ kind: "email" })}>
									Use another email
								</TextAction>
								<TextAction className="-mr-1.5 ml-auto" disabled={busy} onClick={() => sendCode(true)}>
									Send it again
								</TextAction>
							</span>
						</>
					) : (
						<form
							className="flex flex-col gap-2.5"
							onSubmit={(event) => {
								event.preventDefault();
								named();
							}}
						>
							<span className="text-primary type-label">Your name, as the team sees it on your comments.</span>
							<TextField
								label="Name"
								value={name}
								onValueChange={setName}
								inputProps={{ autoFocus: true, maxLength: 60 }}
							/>
							<div className="flex items-center gap-2 rounded-sm border border-line-default px-2.5 py-2">
								<span
									aria-hidden="true"
									className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-raised font-semibold text-[10px] text-primary uppercase leading-none"
								>
									{(name.trim() || step.fallback).charAt(0)}
								</span>
								<span className="min-w-0 truncate text-primary type-control">
									{name.trim() === "" ? step.fallback : name}
								</span>
								<span className="shrink-0 text-tertiary type-detail">via share · now</span>
							</div>
							<Button
								size="md"
								variant="primary"
								type="submit"
								className="w-full"
								disabled={busy || name.trim() === ""}
							>
								Continue
							</Button>
						</form>
					)}
					{error === null ? null : (
						<p className="text-danger-strong type-label" data-viewer-sign-in-error="">
							{error}
						</p>
					)}
				</div>
			</Dialog>
		</div>
	);
}

/** Where the one-time tip is remembered as seen, for this share. */
const TIP_KEY = (share: string) => `spool-comments-tip:${share}`;

/** Whether this browser has been shown the tip for this share. */
export function tipSeen(share: string): boolean {
	try {
		return window.localStorage.getItem(TIP_KEY(share)) !== null;
	} catch {
		return true;
	}
}

export function markTipSeen(share: string): void {
	try {
		window.localStorage.setItem(TIP_KEY(share), "1");
	} catch {}
}

/** An outsider's first look, signed out: one tip over the Comment tool, once. */
export function CommentsTip({ by, onDone }: { by: string; onDone: () => void }) {
	return (
		<div
			className="pointer-events-auto absolute bottom-full left-1/2 mb-3 w-[280px] -translate-x-1/2"
			data-comments-tip=""
		>
			<Popover pad="none" className="flex flex-col gap-2.5 px-3.5 py-3">
				<span className="text-primary type-body">
					{by}'s team talks about these screens in comments. Sign in to read them and leave your own.
				</span>
				<span className="flex items-center gap-2">
					<span className="min-w-0 flex-1 text-secondary type-label">Press C or pick the comment tool.</span>
					<TextAction className="-mr-1.5" onClick={onDone}>
						Got it
					</TextAction>
				</span>
			</Popover>
		</div>
	);
}
