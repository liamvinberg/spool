import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { WelcomeField } from "shared/ui/explore/onboarding/welcome/field";
import { SpoolMark } from "shared/ui/spool/mark";
import "./quiet.css";

const steps = [
	{ title: "Welcome to spool.", body: "A canvas for working things out. Design with your agent, then try what you make." },
	{ title: "Make it with your agent.", body: "Work with the agent in spool, or bring the one you already use." },
	{ title: "A place for your project.", body: "Your designs live in a design/ folder, alongside your project. They’re yours to keep and change." },
] as const;

function Arrow({ back = false }: { back?: boolean }) {
	return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ transform: back ? "rotate(180deg)" : undefined }}><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Folder() {
	return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5a1 1 0 0 1 1-1H8l2 2h6.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

export function QuietWelcome({ initialStep = 0 }: { initialStep?: number }) {
	const [step, setStep] = useState(Math.min(2, Math.max(0, initialStep)));
	const [agent, setAgent] = useState("built-in");
	const reducedMotion = useReducedMotion();
	const current = steps[step] ?? steps[0];

	return (
		<main className="quiet-welcome font-sans" aria-label="Welcome to spool">
			<WelcomeField variant="quiet" step={step} />
			<header className="quiet-brand"><SpoolMark className="quiet-mark" /><span>spool</span></header>
			<div className="quiet-copy" aria-live="polite">
				<AnimatePresence mode="wait" initial={false}>
					<motion.section key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22 }}>
						<h1>{current.title}</h1>
						<p className="quiet-description">{current.body}</p>
						{step === 1 && (
							<fieldset className="quiet-agents">
								<legend className="sr-only">Choose your agent</legend>
								{[{ value: "built-in", title: "Built-in agent", detail: "Start here, inside spool." }, { value: "own", title: "Use my own", detail: "Keep the workflow you know." }].map((choice) => (
									<label className="quiet-agent" key={choice.value}>
										<input type="radio" name="quiet-agent" value={choice.value} checked={agent === choice.value} onChange={() => setAgent(choice.value)} />
										<span className="quiet-radio" aria-hidden="true" />
										<span><strong>{choice.title}</strong><small>{choice.detail}</small></span>
									</label>
								))}
							</fieldset>
						)}
						{step === 2 && (
							<div className="quiet-tree font-mono" aria-label="Your project contains a design folder with frames and shared files">
								<div className="quiet-tree-project"><Folder /><span>my-project</span></div>
								<div className="quiet-tree-design"><Folder /><span>design</span><span className="quiet-tree-note">your canvas</span></div>
								<div className="quiet-tree-child"><Folder /><span>frames</span></div>
								<div className="quiet-tree-child"><Folder /><span>shared</span></div>
							</div>
						)}
					</motion.section>
				</AnimatePresence>
			</div>
			<nav className="quiet-navigation" aria-label="Welcome steps">
				<button className="quiet-back" type="button" disabled={step === 0} onClick={() => setStep((previous) => Math.max(0, previous - 1))}><Arrow back /><span>Back</span></button>
				<div className="quiet-progress" role="img" aria-label={`Step ${step + 1} of 3`}>
					{steps.map((item, index) => <span key={item.title} data-active={index === step} />)}
				</div>
				<button className="quiet-next" type="button" onClick={() => setStep((previous) => previous === 2 ? 0 : previous + 1)}><span>{step === 2 ? "Replay welcome" : "Continue"}</span>{step !== 2 && <Arrow />}</button>
			</nav>
		</main>
	);
}
