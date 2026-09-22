import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { ShortField } from "./field";
import { Landing } from "./landing";
import type { Auth, Agent, Project } from "./landing";
import "./short.css";

/**
 * Three steps and the canvas. Every choice that needs a follow-up (a name, a
 * folder, a sign-in) opens in place on its own step instead of taking a screen.
 */
const STEPS = [
	{
		title: "Welcome to spool.",
		body: "A canvas for working things out. Design with your agent, then try what you make.",
	},
	{
		title: "Where shall we start?",
		body: "spool keeps your designs in a design/ folder inside your project. Plain files, yours to keep.",
	},
	{
		title: "Where do you like to work?",
		body: "Both use the same files in design/. You can switch whenever you like.",
	},
] as const;

const LAST = 3;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Every moving thing reads these, written once per animation frame off the field's clock. */
function write(root: HTMLElement, carry: number) {
	root.style.setProperty("--c1", clamp(carry).toFixed(4));
	root.style.setProperty("--c2", clamp(carry - 1).toFixed(4));
	root.style.setProperty("--c3", clamp(carry - 2).toFixed(4));
	for (let index = 0; index <= LAST; index += 1) {
		const distance = Math.abs(carry - index);
		root.style.setProperty(`--t${index}`, Math.max(0, 1 - distance * 1.7).toFixed(4));
		root.style.setProperty(`--y${index}`, `${(Math.min(1, Math.max(-1, carry - index)) * -24).toFixed(2)}px`);
	}
}

export function OnboardingShort({
	initialStep = 0,
	initialProject = "new",
	initialAgent = "spool",
	initialAuth = "idle",
	initialSent = false,
	returnAfter = 2600,
}: {
	initialStep?: number;
	initialProject?: Project;
	initialAgent?: Agent;
	initialAuth?: Auth;
	initialSent?: boolean;
	/** how long the simulated browser takes to come back; null holds the wait for a still */
	returnAfter?: number | null;
}) {
	const start = Math.max(0, Math.min(LAST, initialStep));
	const [step, setStep] = useState(start);
	const [presses, setPresses] = useState(0);
	const [project, setProject] = useState<Project>(initialProject);
	const [name, setName] = useState("my-idea");
	const [folder, setFolder] = useState<string | null>(initialProject === "existing" ? "coffee-shop" : null);
	const [agent, setAgent] = useState<Agent>(initialAgent);
	const [auth, setAuth] = useState<Auth>(initialAuth);
	const rootRef = useRef<HTMLElement>(null);
	const onCarry = useCallback((carry: number) => {
		const root = rootRef.current;
		if (root) write(root, carry);
	}, []);
	useLayoutEffect(() => {
		const root = rootRef.current;
		if (root) write(root, start);
	}, [start]);
	// The browser coming back, simulated. A real one resolves on the daemon's poll.
	useEffect(() => {
		if (auth !== "waiting" || returnAfter === null) return;
		const timer = window.setTimeout(() => setAuth("connected"), returnAfter);
		return () => window.clearTimeout(timer);
	}, [auth, returnAfter]);

	const go = (next: number) => {
		setPresses((count) => count + 1);
		setStep(next);
	};
	const replay = () => {
		setAuth(initialAuth === "connected" ? "connected" : "idle");
		go(0);
	};
	const projectName = project === "new" ? name.trim() || "my-idea" : (folder ?? "my-project");
	const path = `~/Projects/${projectName}`;
	const ready = project === "new" ? name.trim() !== "" : folder !== null;

	const primary = (() => {
		if (step === 0) return { label: "Start", disabled: false, run: () => go(1) };
		if (step === 1) return { label: "Continue", disabled: !ready, run: () => go(2) };
		if (agent === "spool" && auth === "waiting") return { label: "Waiting", disabled: true, run: () => {} };
		if (agent === "spool" && auth !== "connected")
			return { label: "Sign in with ChatGPT", disabled: false, run: () => setAuth("waiting"), out: true };
		return { label: "Open canvas", disabled: false, run: () => go(3) };
	})();

	const option = (selected: boolean, onSelect: () => void, icon: ReactNode, heading: string, detail: string) => (
		<button type="button" aria-pressed={selected} onClick={onSelect}>
			<span className="short-option-icon" aria-hidden="true">{icon}</span>
			<span><strong>{heading}</strong><small>{detail}</small></span>
			<span className="short-radio" aria-hidden="true">{selected ? "✓" : ""}</span>
		</button>
	);

	return (
		<main className="short-onboarding" ref={rootRef} data-step={step}>
			<div className="short-field"><ShortField step={step} press={presses} onCarry={onCarry} /></div>
			<div className="short-bounds" aria-hidden="true" />
			<div className="short-mark"><SpoolMark title="spool" /></div>

			<div className="short-content" inert={step === LAST}>
				<section className="short-step" data-index={0} data-live={step === 0} aria-hidden={step === 0 ? undefined : true}>
					<h1>{STEPS[0].title}</h1>
					<p className="short-description">{STEPS[0].body}</p>
					<a className="short-quiet short-early" href="https://github.com/liamvinberg/spool/issues" target="_blank" rel="noreferrer">
						spool is before 1.0. Tell us what you find <span aria-hidden="true">↗</span>
					</a>
				</section>

				<section className="short-step" data-index={1} data-live={step === 1} aria-hidden={step === 1 ? undefined : true}>
					<h1>{STEPS[1].title}</h1>
					<p className="short-description">{STEPS[1].body}</p>
					<div className="short-options">
						{option(project === "new", () => setProject("new"), "+", "Start something new", "A new folder for a new idea.")}
						<Reveal open={project === "new"}>
							<div className="short-inline">
								<input aria-label="Project name" value={name} spellCheck={false} autoComplete="off"
									onChange={(event) => setName(event.target.value.replace(/[/\\]/g, ""))} />
								<code>~/Projects/{name.trim() || "my-idea"}</code>
							</div>
						</Reveal>
						{option(project === "existing", () => setProject("existing"), <Folder />, "Open a project", "A folder you already work in.")}
						<Reveal open={project === "existing"}>
							<div className="short-inline">
								{folder === null ? (
									<button type="button" className="short-choose" onClick={() => setFolder("coffee-shop")}>
										<Folder /> Choose a folder
									</button>
								) : (
									<>
										<span className="short-found"><Folder /><strong>{folder}</strong></span>
										<code>design/ · 6 frames</code>
									</>
								)}
							</div>
						</Reveal>
					</div>
				</section>

				<section className="short-step" data-index={2} data-live={step === 2} aria-hidden={step === 2 ? undefined : true}>
					<h1>{STEPS[2].title}</h1>
					<p className="short-description">{STEPS[2].body}</p>
					<div className="short-options">
						{option(agent === "spool", () => setAgent("spool"), <SpoolMark />, "Here in spool", "Chat beside the canvas, with your ChatGPT account.")}
						<Reveal open={agent === "spool"}>
							<div className="short-inline short-auth" data-auth={auth}>
								{auth === "waiting" ? (
									<>
										<span className="short-orbit" aria-hidden="true" />
										<span>Finish signing in in your browser.</span>
										<button type="button" className="short-quiet" onClick={() => setAuth("cancelled")}>Cancel</button>
									</>
								) : auth === "connected" ? (
									<>
										<span className="short-check" aria-hidden="true">✓</span>
										<span>Connected to ChatGPT</span>
										<code>you@example.com</code>
									</>
								) : (
									<>
										<span>{auth === "cancelled" ? "Sign-in was cancelled. Try again when you’re ready." : "Sign-in opens in your browser. Your password stays with OpenAI."}</span>
										<button type="button" className="short-quiet" onClick={() => go(3)}>Later</button>
									</>
								)}
							</div>
						</Reveal>
						{option(agent === "own", () => setAgent("own"), "›_", "In my own agent", "Claude Code, Codex, Cursor or similar.")}
						<Reveal open={agent === "own"}>
							<div className="short-inline">
								<span>The canvas gives you this folder and a prompt to paste.</span>
							</div>
						</Reveal>
					</div>
				</section>
			</div>

			<nav className="short-navigation" aria-label="Onboarding" inert={step === LAST}>
				<button type="button" className="short-back" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
				<div className="short-dots" aria-label={`Step ${Math.min(step, 2) + 1} of 3`}>
					{[0, 1, 2].map((index) => <span key={index} data-index={index} />)}
				</div>
				<button type="button" className="short-next" disabled={primary.disabled} onClick={primary.run}>
					{primary.label}
					{primary.disabled ? <span className="short-orbit short-orbit-small" aria-hidden="true" /> : <span aria-hidden="true">{"out" in primary ? "↗" : "→"}</span>}
				</button>
			</nav>

			<div className="short-landing" inert={step !== LAST}>
				<Landing
					project={project}
					name={projectName}
					path={path}
					agent={agent}
					auth={auth}
					initialSent={initialSent}
					onSignIn={() => setAuth("connected")}
					onReplay={replay}
				/>
			</div>
		</main>
	);
}

/** Height follows content, so an option's follow-up opens under it instead of on a new screen. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
	return (
		<div className="short-reveal" data-open={open} inert={!open}>
			<div>{children}</div>
		</div>
	);
}

function Folder() {
	return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h5l1.6 2H17.5v8h-15z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}
