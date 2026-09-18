import { useState } from "react";
import { WelcomeField } from "shared/ui/explore/onboarding/welcome/field";
import { SpoolMark } from "shared/ui/spool/mark";
import "./flowing.css";

const steps = [
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

function Arrow({ back = false }: { back?: boolean }) {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: back ? "rotate(180deg)" : undefined }}>
			<path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function Folder({ open = false }: { open?: boolean }) {
	return (
		<svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
			<path d={open ? "M3 7V4.5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1V7M2.5 7h15l-1.7 9h-12z" : "M3 6V4.5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
		</svg>
	);
}

export function FlowingWelcome({ initialStep = 0 }: { initialStep?: number }) {
	const [step, setStep] = useState(Math.min(2, Math.max(0, initialStep)));
	const [agent, setAgent] = useState("built-in");
	const [direction, setDirection] = useState(1);
	const current = steps[step] ?? steps[0];
	function move(next: number) {
		setDirection(next > step ? 1 : -1);
		setStep(next);
	}
	return (
		<main className="flowing-welcome" data-step={step} data-direction={direction}>
			<WelcomeField variant="flowing" step={step} />
			<header className="fw-brand"><SpoolMark className="fw-mark" /><span>spool</span></header>
			<div className="fw-copy-position">
				<section className="fw-copy" key={step} aria-live="polite" aria-atomic="true">
					<h1>{current.title}</h1>
					<p>{current.body}</p>
					{step === 1 && (
						<div className="fw-agents" role="group" aria-label="Choose your agent">
							<button type="button" aria-pressed={agent === "built-in"} onClick={() => setAgent("built-in")}>
								<span className="fw-choice-radio"><span /></span><span>Built-in agent</span>
							</button>
							<button type="button" aria-pressed={agent === "own"} onClick={() => setAgent("own")}>
								<span className="fw-choice-radio"><span /></span><span>Use my own</span>
							</button>
						</div>
					)}
					{step === 2 && (
						<div className="fw-project" aria-label="Example project: my-project contains design, with frames and shared folders">
							<div className="fw-folder"><Folder /><span>my-project</span></div>
							<div className="fw-tree-branch"><div className="fw-folder fw-design"><Folder open /><span>design</span></div>
								<div className="fw-tree-branch"><div className="fw-folder"><Folder /><span>frames</span></div><div className="fw-folder"><Folder /><span>shared</span></div></div>
							</div>
						</div>
					)}
				</section>
			</div>
			<footer className="fw-footer">
				<div className="fw-progress" aria-label={`Step ${step + 1} of 3`}>
					{steps.map((item, index) => <span key={item.title} data-active={index === step} data-complete={index < step} />)}
				</div>
				<nav className="fw-controls" aria-label="Welcome steps">
					<button type="button" className="fw-back" onClick={() => move(step - 1)} disabled={step === 0}><Arrow back />Back</button>
					<button type="button" className="fw-next" onClick={() => move(step === 2 ? 0 : step + 1)}>{step === 2 ? "Replay" : "Continue"}<Arrow /></button>
				</nav>
			</footer>
		</main>
	);
}
