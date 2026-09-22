import { useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { ArrowRightIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";

export type Project = "new" | "existing";
export type Agent = "spool" | "own";
export type Auth = "idle" | "waiting" | "connected" | "cancelled";

const PRIMARY =
	"inline-flex min-h-9 items-center justify-center gap-2 rounded-sm bg-text px-3.5 text-bg type-control hover:bg-text/90";
const QUIET = "rounded-sm text-muted type-control hover:text-text";
const IDEAS = ["A personal website", "A small coffee shop", "A mobile checkout"] as const;

/**
 * Where onboarding ends: the project's own canvas, with the first prompt waiting
 * where its frames will land. Nothing here is onboarding chrome; it is the app.
 */
export function Landing({
	project,
	name,
	path,
	agent,
	auth,
	initialSent,
	onSignIn,
	onReplay,
}: {
	project: Project;
	name: string;
	path: string;
	agent: Agent;
	auth: Auth;
	initialSent: boolean;
	onSignIn: () => void;
	onReplay: () => void;
}) {
	const [sent, setSent] = useState<string | null>(initialSent ? `${IDEAS[1]}. Start with the home page.` : null);
	const existing = project === "existing";
	const replay = (
		<button type="button" onClick={onReplay} className="px-2 font-mono text-2xs text-muted/60 hover:text-text">
			replay onboarding
		</button>
	);
	return (
		<SpoolShell activeTab={name} tabs={[name]} zoom={existing ? "60%" : "100%"} headerAccessory={replay}>
			<CanvasChrome
				pages={existing ? [{ name: "app", frames: ["menu", "cart"], active: true, open: true }] : []}
				tool={existing ? "select" : "none"}
				rail={agent === "spool" ? <AgentRail auth={auth} sent={sent} onSend={setSent} onSignIn={onSignIn} /> : null}
				railWidth={agent === "spool" ? 380 : 0}
				railLabel="Agent"
			>
				{existing ? <Frames /> : sent ? <Arriving /> : <Empty name={name} path={path} agent={agent} />}
				{existing && agent === "own" && <OwnBar path={path} />}
			</CanvasChrome>
		</SpoolShell>
	);
}

function Empty({ name, path, agent }: { name: string; path: string; agent: Agent }) {
	return (
		<div className="flex h-full items-center justify-center pb-12">
			<div className="absolute left-7 top-6">
				<p className="type-body">{name}</p>
				<p className="mt-1 text-muted type-detail">saved on this mac</p>
			</div>
			<div className="flex max-w-[420px] flex-col items-center text-center">
				<SpoolMark className="mb-6 h-10 w-8 text-thread" />
				<h1 className="type-heading">Your canvas is ready.</h1>
				{agent === "spool" ? (
					<p className="mt-3 text-muted type-body [text-wrap:balance]">Describe your idea in the chat. Frames appear here as the agent makes them.</p>
				) : (
					<>
						<p className="mt-3 text-muted type-body [text-wrap:balance]">
							Open this folder in your agent and paste the prompt. Frames appear here as it writes them.
						</p>
						<code className="mt-7 select-text text-muted type-detail">{path}</code>
						<div className="mt-4 flex gap-2">
							<Copy text={path} label="Copy path" />
							<Copy primary text={starter(path)} label="Copy prompt" />
						</div>
					</>
				)}
			</div>
		</div>
	);
}

/** The first frames arriving, drawn as the outlines the agent is writing into. */
function Arriving() {
	return (
		<div className="flex h-full items-center justify-center gap-6 pb-10">
			{["home", "home--b"].map((frame, index) => (
				<div key={frame} className="short-arrive" style={{ animationDelay: `${0.5 + index * 0.9}s` }}>
					<div className="mb-2.5 flex justify-between text-muted type-detail">
						<span>{frame}</span>
						<span>writing</span>
					</div>
					<div className="short-arrive-body h-[340px] w-[196px] rounded-[2px] border border-border-raised bg-surface" />
				</div>
			))}
		</div>
	);
}

function Frames() {
	return (
		<div className="absolute inset-0 flex items-center justify-center gap-7 px-8 pb-8">
			{(["menu", "cart"] as const).map((name) => (
				<div key={name} className="shrink-0">
					<div className="mb-3 flex items-center justify-between text-muted type-detail">
						<span>{name}</span>
						<span>390 × 844</span>
					</div>
					<div className="h-[509px] w-[235px] overflow-hidden rounded-[2px]">
						<div className="h-[520px] w-[240px] origin-top-left" style={{ transform: "scale(0.979167)" }}>
							<CoffeeScreen screen={name} />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function OwnBar({ path }: { path: string }) {
	return (
		<div className="absolute top-5 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-md border border-border-raised bg-surface py-2 pr-2 pl-4">
			<span className="text-muted type-label">Open <code className="text-text type-detail">{path}</code> in your agent</span>
			<Copy text={starter(path)} label="Copy prompt" />
		</div>
	);
}

function AgentRail({
	auth,
	sent,
	onSend,
	onSignIn,
}: {
	auth: Auth;
	sent: string | null;
	onSend: (text: string) => void;
	onSignIn: () => void;
}) {
	const [draft, setDraft] = useState("");
	const [signing, setSigning] = useState(false);
	const connected = auth === "connected";
	const send = () => {
		const text = draft.trim();
		if (!text || !connected) return;
		onSend(text);
		setDraft("");
	};
	return (
		<div className="flex h-full flex-col bg-bg">
			<div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<span className="type-control">New chat</span>
				<span className="text-muted type-detail">{connected ? "ChatGPT" : "not signed in"}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col px-5 py-6">
				{sent ? (
					<div className="flex flex-col gap-5">
						<p className="ml-8 rounded-md border border-border-raised bg-surface px-3.5 py-2.5 type-body">{sent}</p>
						<div className="flex gap-3 text-muted type-body">
							<SpoolMark className="mt-1 h-5 w-4 shrink-0 text-thread" />
							<p>I’ll start with two directions for the first screen, side by side on the canvas.</p>
						</div>
						<p className="font-mono text-2xs text-muted/60">writing frames/home · frames/home--b</p>
					</div>
				) : connected ? (
					<div className="mt-auto mb-2">
						<p className="type-heading">What should we make first?</p>
						<p className="mt-2 text-muted type-body">A rough idea is enough. The agent can help work out the rest.</p>
						<div className="mt-5 flex flex-wrap gap-1.5">
							{IDEAS.map((idea) => (
								<button key={idea} type="button" onClick={() => setDraft(`${idea}. Start with the home page.`)}
									className="rounded-sm border border-border-raised px-2.5 py-1 text-muted type-label hover:bg-raised hover:text-text">
									{idea}
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="my-auto text-center">
						<p className="type-body">Sign in to use the agent here.</p>
						<p className="mt-1.5 text-muted type-label">Or open this folder in your own agent.</p>
						<button type="button" className={cn(PRIMARY, "mt-5")} disabled={signing}
							onClick={() => { setSigning(true); window.setTimeout(onSignIn, 1600); }}>
							{signing ? "Waiting for your browser" : "Sign in with ChatGPT"} <span aria-hidden="true">↗</span>
						</button>
					</div>
				)}
			</div>
			<div className="px-3.5 pb-3.5">
				<div className={cn("rounded-md border border-border-raised bg-surface px-3 py-2.5", !connected && "opacity-40")}>
					<textarea
						aria-label="Message your agent"
						value={draft}
						disabled={!connected}
						autoFocus={connected}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								send();
							}
						}}
						placeholder="What would you like to make?"
						className="h-16 w-full resize-none bg-transparent type-body outline-none placeholder:text-muted"
					/>
					<div className="flex items-center justify-end">
						<button type="button" aria-label="Send" onClick={send} disabled={!draft.trim()}
							className="flex h-7 w-7 items-center justify-center rounded-sm bg-text text-bg disabled:bg-raised disabled:text-muted">
							<ArrowRightIcon className="h-3.5 w-3.5 -rotate-90" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function Copy({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
	return (
		<button
			type="button"
			className={primary ? PRIMARY : cn(QUIET, "min-h-9 border border-border-raised px-3.5 hover:bg-raised")}
			onClick={() => {
				void navigator.clipboard
					.writeText(text)
					.then(() => setState("copied"))
					.catch(() => setState("failed"));
			}}
		>
			{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
		</button>
	);
}

const starter = (path: string) =>
	`Use spool in ${path}/design. Read the project instructions and design/AGENTS.md, then run the project's spool skill command. Ask me what we're making first.`;
