import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { CarryField } from "shared/ui/explore/onboarding/opening-refinement/carry-field";
import "./carry.css";

const STEPS = [
	{
		title: "Welcome to spool.",
		body: "A canvas for working things out. Design with your agent, then try what you make.",
	},
	{
		title: "Make it with your agent.",
		body: "Work with the agent in spool, or bring the one you already use.",
	},
	{
		title: "A place for your project.",
		body: "Your designs live in a design/ folder, alongside your project. They’re yours to keep and change.",
	},
] as const;

/** Every moving thing in the frame reads these, written once per animation frame. */
function write(root: HTMLElement, carry: number) {
	root.style.setProperty("--carry", carry.toFixed(4));
	root.style.setProperty("--c1", Math.min(1, Math.max(0, carry)).toFixed(4));
	root.style.setProperty("--c2", Math.min(1, Math.max(0, carry - 1)).toFixed(4));
	for (let index = 0; index < STEPS.length; index += 1) {
		const distance = Math.abs(carry - index);
		root.style.setProperty(`--t${index}`, Math.max(0, 1 - distance * 1.7).toFixed(4));
		root.style.setProperty(`--y${index}`, `${(Math.min(1, Math.max(-1, carry - index)) * -30).toFixed(2)}px`);
	}
}

export function CarryWelcome({ initialStep = 0 }: { initialStep?: number }) {
	const start = Math.max(0, Math.min(STEPS.length - 1, initialStep));
	const [step, setStep] = useState(start);
	const [presses, setPresses] = useState(0);
	const [agent, setAgent] = useState<"spool" | "own">("spool");
	const rootRef = useRef<HTMLElement>(null);
	const onCarry = useCallback((carry: number) => {
		const root = rootRef.current;
		if (root) write(root, carry);
	}, []);
	useLayoutEffect(() => {
		const root = rootRef.current;
		if (root) write(root, start);
	}, [start]);
	const go = (next: number) => {
		setPresses((count) => count + 1);
		setStep(next);
	};
	return (
		<main className="carry-welcome" ref={rootRef} data-step={step}>
			<CarryField step={step} press={presses} onCarry={onCarry} />
			<div className="carry-bounds" aria-hidden="true">
				<span className="carry-bound-label">my-project / design</span>
				<i /><i /><i /><i />
			</div>
			<div className="carry-surround" aria-hidden="true">
				<div className="carry-ghost carry-ghost-left" />
				<div className="carry-ghost carry-ghost-right" />
			</div>
			<div className="carry-mark">
				<SpoolMark title="spool" />
			</div>
			<div className="carry-content">
				{STEPS.map((content, index) => (
					<section key={content.title} className="carry-step" data-index={index} data-live={index === step}
						aria-hidden={index === step ? undefined : true}>
						<h1>{content.title}</h1>
						<p className="carry-description">{content.body}</p>
						{index === 1 && (
							<div className="carry-agent-options" aria-label="Choose your agent">
								<button type="button" aria-pressed={agent === "spool"} onClick={() => setAgent("spool")}>
									<SpoolMark />
									<span><strong>Built-in agent</strong><small>Right here, beside your canvas.</small></span>
									<span className="carry-radio" aria-hidden="true">{agent === "spool" ? "✓" : ""}</span>
								</button>
								<button type="button" aria-pressed={agent === "own"} onClick={() => setAgent("own")}>
									<span className="carry-terminal" aria-hidden="true">›_</span>
									<span><strong>Use my own</strong><small>Keep the workflow you know.</small></span>
									<span className="carry-radio" aria-hidden="true">{agent === "own" ? "✓" : ""}</span>
								</button>
							</div>
						)}
						{index === 2 && (
							<div className="carry-project" aria-label="Your project contains a design folder with frames and shared folders">
								<div className="carry-project-row"><Folder /><span>my-project</span></div>
								<div className="carry-project-branch">
									<div className="carry-project-row carry-design-row"><Folder /><span>design</span><SpoolMark /></div>
									<div className="carry-project-children">
										<div className="carry-project-row"><Folder /><span>frames</span></div>
										<div className="carry-project-row"><Folder /><span>shared</span></div>
									</div>
								</div>
							</div>
						)}
					</section>
				))}
			</div>
			<nav className="carry-navigation" aria-label="Welcome steps">
				<button type="button" className="carry-back" disabled={step === 0} onClick={() => go(Math.max(0, step - 1))}>Back</button>
				<div className="carry-dots" aria-label={`Step ${step + 1} of 3`}>
					{[0, 1, 2].map((index) => <span key={index} data-index={index} />)}
				</div>
				<button type="button" className="carry-next" onClick={() => go(step === 2 ? 0 : step + 1)}>
					{step === 2 ? "Replay" : "Continue"}<span aria-hidden="true">{step === 2 ? "↺" : "→"}</span>
				</button>
			</nav>
		</main>
	);
}

function Folder() {
	return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h5l1.6 2H17.5v8h-15z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}
