import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { CarryField } from "shared/ui/explore/onboarding/opening-refinement/carry-field";
import { modules, stageFor } from "./content";
import type { Agent, Module, Project, Source } from "./content";
import "shared/ui/explore/onboarding/welcome/opening.css";
import "./steps.css";

const ignoreCarry = (_carry: number) => {};
const ease = [0.22, 1, 0.36, 1] as const;

export function OnboardingSteps({ initial = "welcome", initialAgent = "own", initialProject = "new" }: {
 initial?: Module; initialAgent?: Agent; initialProject?: Project;
}) {
 const [step, setStep] = useState<Module>(initial);
 const [history, setHistory] = useState<Module[]>([]);
 const [press, setPress] = useState(0);
 const [agent, setAgent] = useState<Agent>(initialAgent);
 const [project, setProject] = useState<Project>(initialProject);
 const [source, setSource] = useState<Source>("Figma");
 const [name, setName] = useState(initial === "found" || initial === "sample" ? "coffee-shop" : "my-project");
 const [reference, setReference] = useState("");
 const [idea, setIdea] = useState("A small website for a coffee shop. Start with the home page and explore two directions.");
 const [account, setAccount] = useState("");
 const [copied, setCopied] = useState("");
 const [copyError, setCopyError] = useState(false);
 const [opened, setOpened] = useState(false);
 const reduced = useReducedMotion();
 const stage = stageFor(step);
 const title = modules[step];
 const folder = `~/Projects/${name.trim() || "my-project"}`;
 const starter = `Use spool in this project's design/ folder. Read the project instructions and design/AGENTS.md, then run the project's spool skill command. ${project === "import" || step === "import" ? `Recreate the design from ${source}${reference.trim() ? `: ${reference.trim()}` : " (I’ll provide the source)"} as live, editable frames. Ask me for access or an export if you cannot read it. Start with one screen so we can review it together.` : idea}`;
 const go = (next: Module) => { setHistory((items) => [...items, step]); setStep(next); setPress((n) => n + 1); setCopied(""); };
 const back = () => { const previous = history.at(-1); if (previous) { setStep(previous); setHistory((items) => items.slice(0, -1)); setPress((n) => n + 1); } };
 const copy = async (text: string, key: string) => {
  try { await navigator.clipboard.writeText(text); setCopied(key); setCopyError(false); }
  catch { setCopyError(true); }
 };
 const next = () => {
  switch (step) {
   case "welcome": go("project"); break;
   case "project": go(project === "import" ? "source" : project === "sample" ? "sample" : project); break;
   case "source": setProject("import"); go("reference"); break;
   case "reference": go("new"); break;
   case "new": case "existing": go("agent"); break;
   case "agent": go(agent === "own" ? "handoff" : "connect"); break;
   case "connect": go("ready"); break;
   case "handoff": go(project === "import" ? "import" : "ready"); break;
   case "sample": setName("coffee-shop"); setProject("sample"); go("ready"); break;
   case "import": case "prompt": case "found": case "browser": go("ready"); break;
   case "ready": setOpened(true); setPress((n) => n + 1); break;
   default: go("project");
  }
 };
 const label = step === "ready" ? "Open project" : step === "existing" ? "Use this folder" : step === "new" ? "Create project" : step === "connect" && !account ? "Set up later" : "Continue";
 const choice = (value: string, selected: string, onSelect: () => void, heading: string, body: string, icon: ReactNode) => (
  <button type="button" aria-pressed={value === selected} onClick={onSelect}>
   <span className="steps-option-icon" aria-hidden="true">{icon}</span><span><strong>{heading}</strong><small>{body}</small></span><span className="opening-radio" aria-hidden="true">{value === selected ? "✓" : ""}</span>
  </button>
 );
 const promptBox = <div className="steps-prompt"><textarea aria-label="Prompt for your agent" readOnly value={starter} /><button type="button" onClick={() => void copy(starter, "prompt")}>{copied === "prompt" ? "Copied" : "Copy prompt"}</button></div>;
 const body = () => {
  switch (step) {
   case "welcome": return <button className="steps-subtle steps-welcome-note" type="button" onClick={() => go("preview")}>Before 1.0. Help shape what comes next.</button>;
   case "project": return <div className="opening-agent-options steps-options steps-compact">
    {choice("new", project, () => setProject("new"), "Start a new project", "Give a new idea its own folder.", "+")}
    {choice("existing", project, () => setProject("existing"), "Open a project", "Use a folder you already work in.", <Folder />)}
    {choice("import", project, () => setProject("import"), "Start from a design", "Bring Figma, Paper, Pen, or an image.", "↗")}
    <button className="steps-inline-choice" type="button" onClick={() => { setProject("sample"); go("sample"); }}>Or explore an example <span>→</span></button>
   </div>;
   case "new": return <div className="steps-form"><label htmlFor="project-name">Project name</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /><div className="steps-location"><Folder /><code>{folder}/design</code></div><p>Your project folder will be created here.</p></div>;
   case "existing": return <div className="steps-form"><label htmlFor="project-folder">Project folder</label><input id="project-folder" value={folder} readOnly /><div className="steps-folder-choices"><button type="button" onClick={() => setName("my-project")}>my-project</button><button type="button" onClick={() => { setName("coffee-shop"); go("found"); }}>coffee-shop <span>has designs</span></button></div><p>Example folders for this exploration.</p></div>;
   case "files": return <Tree name={name} />;
   case "found": return <><Tree name={name} /><p className="steps-note">6 frames · 2 pages · coffee-shop</p></>;
   case "agent": return <><div className="opening-agent-options steps-options">
    {choice("own", agent, () => setAgent("own"), "In my own agent", "Open this folder and copy a starter prompt.", "›_")}
    {choice("spool", agent, () => setAgent("spool"), "Here in spool", "Connect an account. Chat beside the canvas.", <SpoolMark />)}
   </div><p className="steps-note">{agent === "own" ? "Your usual agent brings its own tools and connections." : "The built-in agent edits files and runs commands. It has no built-in web search."}</p></>;
   case "connect": return <><div className="opening-agent-options steps-options">
    {choice("ChatGPT", account, () => setAccount("ChatGPT"), "Continue with ChatGPT", "Use your existing account.", "↗")}
    {choice("API key", account, () => setAccount("API key"), "Use an API key", "Connect your preferred provider.", "⌘")}
   </div><p className="steps-note">{account ? `${account} selected. Account connection is simulated here.` : "You can connect an account after opening your project."}</p></>;
   case "handoff": return <><div className="steps-path"><code>{folder}</code><button type="button" onClick={() => void copy(folder, "folder")}>{copied === "folder" ? "Copied" : "Copy path"}</button></div>{promptBox}</>;
   case "source": return <div className="opening-agent-options steps-options steps-compact">{(["Figma", "Paper", "Pen", "Image"] as const).map((item) => <div key={item}>{choice(item, source, () => setSource(item), item, item === "Image" ? "A screenshot, sketch, or exported screen." : `Use a ${item} link or an exported file.`, item === "Image" ? "▧" : "◇")}</div>)}</div>;
   case "reference": return <div className="steps-form"><label htmlFor="design-reference">{source} link or file path</label><input id="design-reference" value={reference} placeholder={source === "Image" ? "~/Desktop/homepage.png" : "Paste a link or path"} onChange={(event) => setReference(event.target.value)} /><p>You can also share the source directly with your agent later.</p><div className="steps-explanation"><span>01</span> Give your agent access to the source.<br /><span>02</span> Rebuild the first screen as a live frame.<br /><span>03</span> Review it together before adding more.</div></div>;
   case "import": return <>{promptBox}<p className="steps-note">{source} → live frames in <code>design/</code></p></>;
   case "prompt": return <div className="steps-form"><label htmlFor="first-idea">Your first idea</label><textarea id="first-idea" value={idea} onChange={(event) => setIdea(event.target.value)} /><div className="steps-suggestions">{["A personal website", "A small coffee shop", "A mobile checkout"].map((item) => <button key={item} type="button" onClick={() => setIdea(`${item}. Start with one screen and explore two directions.`)}>{item}</button>)}</div></div>;
   case "sample": return <><div className="steps-sample" aria-label="Coffee shop sample preview"><div><small>little coffee</small><strong>A good day<br />starts here.</strong><span>See the menu ↗</span></div><div className="steps-cup"><i /></div></div><button className="steps-subtle" type="button" onClick={() => { setName("coffee-shop"); setProject("sample"); go("ready"); }}>Use the coffee shop example →</button></>;
   case "preview": return <div className="steps-links"><a href="https://github.com/liamvinberg/spool/issues/new" target="_blank" rel="noreferrer">Something feels off? <span>Report an issue ↗</span></a><a href="https://github.com/liamvinberg/spool/issues" target="_blank" rel="noreferrer">Have an idea? <span>See what’s being discussed ↗</span></a><p>Describe what you expected and what happened. A screenshot helps.</p></div>;
   case "ownership": return <><Tree name={name} /><a className="steps-subtle" href="https://github.com/liamvinberg/spool" target="_blank" rel="noreferrer">Explore the source. Fork it if you like. ↗</a></>;
   case "how": return <div className="steps-how"><div><span>“Try two directions.”</span><small>Ask your agent</small></div><i>→</i><div className="steps-mini-frames"><span /><span /><small>See the frames</small></div><i>→</i><div><span className="steps-play">▷</span><small>Try it out</small></div></div>;
   case "basics": return <div className="steps-basics"><div><span>Move around</span><kbd>Space + drag</kbd></div><div><span>Zoom in or out</span><span>Pinch</span></div><div><span>Try a frame</span><span>Open in player ↗</span></div></div>;
   case "browser": return <><div className="steps-browser-bar"><i /><i /><i /><code>localhost</code></div><Tree name={name} /></>;
   case "ready": return <><div className="steps-summary"><div><Folder /><strong>{name.trim() || "my-project"}</strong><code>design/</code></div><p>{project === "import" ? `Starting from ${source}` : project === "sample" ? "Coffee shop example" : project === "existing" ? "Your existing project" : "A fresh canvas"}<span>{agent === "own" ? "Your own agent" : account ? `${account} in spool` : "Set up your agent later"}</span></p></div><button className="steps-subtle" type="button" onClick={() => go("agent")}>Change agent</button></>;
  }
 };
 const milestone = step === "welcome" ? 0 : ["project", "new", "existing", "source", "reference", "sample"].includes(step) ? 1 : step === "ready" ? 3 : 2;
 return <main className="opening-welcome onboarding-steps" data-step={opened ? 2 : stage} data-module={step}>
  <CarryField step={opened ? 2 : stage} press={press} onCarry={ignoreCarry} />
  <div className="opening-bounds" aria-hidden="true"><span className="opening-bound-label">{name.trim() || "my-project"} / design</span><i /><i /><i /><i /></div>
  <div className="opening-surround" aria-hidden="true"><div className="opening-ghost opening-ghost-left" /><div className="opening-ghost opening-ghost-right" /></div>
  {opened ? <motion.section className="steps-canvas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .5 }}>
   <header><SpoolMark /><span>{name} / design</span><button type="button" onClick={() => { setOpened(false); setStep(initial); setHistory([]); setPress((n) => n + 1); }}>Replay onboarding</button></header>
   <div className="steps-canvas-center"><h1>{project === "import" ? "Ready for your first frame." : "Room for your first idea."}</h1><p>{agent === "own" ? "Open the project in your agent and use this prompt to begin." : "Your first conversation starts here."}</p>{promptBox}<p className="steps-note">Prototype canvas. Project creation and agent setup are simulated.</p></div>
  </motion.section> : <>
   <motion.div className="opening-mark" initial={false} animate={{ top: stage === 0 ? 216 : 74, scale: stage === 0 ? 1 : .52 }} transition={{ duration: reduced ? 0 : .78, ease }}><SpoolMark title="spool" /></motion.div>
   <motion.div className="opening-content" initial={false} animate={{ top: stage === 0 ? 354 : 176 }} transition={{ duration: reduced ? 0 : .78, ease }}>
    <AnimatePresence mode="wait" initial={false}><motion.section key={step} aria-live="polite" initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0 : .22 }}>
     <h1>{title.title}</h1><p className="opening-description">{title.body}</p>{body()}{copyError && <p role="status" className="steps-note">Copy wasn’t available. Select and copy the text above.</p>}
    </motion.section></AnimatePresence>
   </motion.div>
   <nav className="opening-navigation" aria-label="Onboarding"><button className="opening-back" type="button" disabled={history.length === 0} onClick={back}>Back</button><div className="opening-dots" aria-label={["Welcome", "Project", "Agent", "Ready"][milestone]}>{[0, 1, 2, 3].map((index) => <span key={index} data-active={index === milestone} />)}</div><button className="opening-next" type="button" disabled={step === "new" && !name.trim()} onClick={next}>{label}<span aria-hidden="true">→</span></button></nav>
  </>}
 </main>;
}
function Folder() { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h5l1.6 2H17.5v8h-15z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>; }
function Tree({ name }: { name: string }) { return <div className="opening-project"><div className="opening-project-row"><Folder /><span>{name}</span></div><div className="opening-project-branch"><div className="opening-project-row opening-design-row"><Folder /><span>design</span><SpoolMark /></div><div className="opening-project-children"><div className="opening-project-row"><Folder /><span>frames</span></div><div className="opening-project-row"><Folder /><span>shared</span></div></div></div></div>; }
