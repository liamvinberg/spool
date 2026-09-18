import { useCallback, useRef, useState } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { MotionField, type Effect, type Playback } from "./field";
import "./study.css";

const studies: Record<Effect, { name: string; description: string }> = {
	dissolve: { name: "Dissolve", description: "The pigment thins and drifts, then gathers into its next shape." },
};

// A scrub-able companion to the dissolve onboarding frame.
export function ShaderStudy({ effect, midpoint = false }: { effect: Effect; midpoint?: boolean }) {
	const [playback,setPlayback]=useState<Playback>({from:0,to:1,mode:midpoint ? "scrub" : "rest",progress:midpoint ? .5 : 0,revision:0});
	const [step,setStep]=useState(midpoint ? 1 : 0);
	const [playing,setPlaying]=useState(false);
	const [showCopy,setShowCopy]=useState(true);
	const slider=useRef<HTMLInputElement>(null),readout=useRef<HTMLOutputElement>(null);
	const current=studies[effect];
	const report=useCallback((value:number) => {
		if(slider.current) slider.current.value=String(value*100);
		if(readout.current) readout.current.value=`${Math.round(value*100)}%`;
	},[]);
	const complete=useCallback(() => setPlaying(false),[]);
	function travel(to:number) {
		setPlayback(previous=>({from:step,to,mode:"play",progress:0,revision:previous.revision+1}));
		setStep(to); setPlaying(true);
	}
	function replay() {
		setPlayback(previous=>({...previous,mode:"play",progress:0,revision:previous.revision+1}));
		setStep(playback.to); setPlaying(true);
	}
	return <main className="shader-study">
		<section className="shader-study-stage" aria-label={`${current.name} shader exploration`}>
			<MotionField effect={effect} playback={playback} onProgress={report} onComplete={complete} />
			<header className="shader-study-brand"><SpoolMark /><span>spool</span></header>
			<div className="shader-study-copy" hidden={!showCopy}>
				<h1>Welcome to spool.</h1>
				<p>A canvas for working things out.</p>
			</div>
			<nav className="shader-study-nav" aria-label="Shader positions">
				<div className="shader-study-dots" aria-label={`Position ${step+1} of 3`}>
					{[0,1,2].map(index=><span key={index} data-current={step===index} />)}
				</div>
				<div className="shader-study-actions">
					<button type="button" disabled={playing} onClick={()=>travel((step+2)%3)}>Back</button>
					<button className="shader-study-next" type="button" disabled={playing} onClick={()=>travel((step+1)%3)}>Next position <span aria-hidden="true">→</span></button>
				</div>
			</nav>
		</section>
		<footer className="shader-study-tools">
			<div className="shader-study-about"><h2>{current.name}</h2><p>{current.description}</p></div>
			<div className="shader-study-transport">
				<label className="shader-study-copy-toggle"><input type="checkbox" checked={showCopy} onChange={event=>setShowCopy(event.target.checked)} />Show copy</label>
				<button type="button" onClick={replay}>Replay</button>
				<label className="shader-study-scrub"><span className="shader-study-sr">Transition progress</span>
					<input ref={slider} type="range" min="0" max="100" step="0.1" defaultValue={midpoint ? 50 : 0} aria-label="Transition progress" onChange={event=>{
						const value=Number(event.target.value)/100;
						setPlaying(false); setStep(playback.to);
						setPlayback(previous=>({...previous,mode:"scrub",progress:value,revision:previous.revision+1}));
					}} />
				</label>
				<output ref={readout}>{midpoint ? "50%" : "0%"}</output>
			</div>
		</footer>
	</main>;
}
