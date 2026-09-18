import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { WelcomeField } from "shared/ui/explore/onboarding/welcome/field";
import "./opening.css";

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

export function OpeningWelcome({ initialStep = 0 }: { initialStep?: number }) {
	const [step, setStep] = useState(Math.max(0, Math.min(2, initialStep)));
	const [agent, setAgent] = useState<"spool" | "own">("spool");
	const reduced = useReducedMotion();
	const content = STEPS[step] ?? STEPS[0];
	const duration = reduced ? 0 : 0.78;
	return (
		<main className="opening-welcome" data-step={step}>
			<WelcomeField variant="opening" step={step} />
			<div className="opening-bounds" aria-hidden="true">
				<span className="opening-bound-label">my-project / design</span>
				<i /><i /><i /><i />
			</div>
			<div className="opening-surround" aria-hidden="true">
				<div className="opening-ghost opening-ghost-left" />
				<div className="opening-ghost opening-ghost-right" />
			</div>
			<motion.div
				className="opening-mark"
				initial={false}
				animate={{ top: step === 0 ? 216 : 74, scale: step === 0 ? 1 : 0.52 }}
				transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
			>
				<SpoolMark title="spool" />
			</motion.div>
			<motion.div
				className="opening-content"
				initial={false}
				animate={{ top: step === 0 ? 354 : 176 }}
				transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.section
						key={step}
						aria-live="polite"
						initial={{ opacity: 0, y: reduced ? 0 : 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: reduced ? 0 : -8 }}
						transition={{ duration: reduced ? 0 : 0.22 }}
					>
						<h1>{content.title}</h1>
						<p className="opening-description">{content.body}</p>
						{step === 1 && (
							<div className="opening-agent-options" aria-label="Choose your agent">
								<button type="button" aria-pressed={agent === "spool"} onClick={() => setAgent("spool")}>
									<SpoolMark />
									<span><strong>Built-in agent</strong><small>Right here, beside your canvas.</small></span>
									<span className="opening-radio" aria-hidden="true">{agent === "spool" ? "✓" : ""}</span>
								</button>
								<button type="button" aria-pressed={agent === "own"} onClick={() => setAgent("own")}>
									<span className="opening-terminal" aria-hidden="true">›_</span>
									<span><strong>Use my own</strong><small>Keep the workflow you know.</small></span>
									<span className="opening-radio" aria-hidden="true">{agent === "own" ? "✓" : ""}</span>
								</button>
							</div>
						)}
						{step === 2 && (
							<div className="opening-project" aria-label="Your project contains a design folder with frames and shared folders">
								<div className="opening-project-row"><Folder /><span>my-project</span></div>
								<div className="opening-project-branch">
									<div className="opening-project-row opening-design-row"><Folder /><span>design</span><SpoolMark /></div>
									<div className="opening-project-children">
										<div className="opening-project-row"><Folder /><span>frames</span></div>
										<div className="opening-project-row"><Folder /><span>shared</span></div>
									</div>
								</div>
							</div>
						)}
					</motion.section>
				</AnimatePresence>
			</motion.div>
			<nav className="opening-navigation" aria-label="Welcome steps">
				<button type="button" className="opening-back" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>
				<div className="opening-dots" aria-label={`Step ${step + 1} of 3`}>
					{[0, 1, 2].map((index) => <span key={index} data-active={step === index} />)}
				</div>
				<button type="button" className="opening-next" onClick={() => setStep(step === 2 ? 0 : step + 1)}>
					{step === 2 ? "Replay" : "Continue"}<span aria-hidden="true">{step === 2 ? "↺" : "→"}</span>
				</button>
			</nav>
		</main>
	);
}

function Folder() {
	return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h5l1.6 2H17.5v8h-15z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}
