import { AgentIcon, PropertiesIcon } from "shared/ui/spool/icons";

const starts = [
	{
		name: "An attached hint",
		target: "onboarding-hint",
		kind: "hint",
		words: "A short note points to the agent. The next hint appears beside the composer.",
		cost: "Smallest change",
	},
	{
		name: "A rail with names",
		target: "onboarding-labels",
		kind: "labels",
		words: "Properties and Agent are written out. Compact the rail after trying both.",
		cost: "Easy to discover",
	},
	{
		name: "Start with chat open",
		target: "onboarding-open",
		kind: "open",
		words: "On an empty canvas, the conversation is ready for your first idea.",
		cost: "Fastest first creation",
	},
	{
		name: "A short guided tour",
		target: "onboarding-tour",
		kind: "tour",
		words: "Four stops: the agent, your ask, properties, and play. Skip or go back.",
		cost: "More explanation",
	},
	{
		name: "Learn by making",
		target: "onboarding-practice",
		kind: "practice",
		words: "Select a sample, ask for a change, then try what changed.",
		cost: "Most hands-on",
	},
];
const changes = [
	{
		name: "Beside the change",
		target: "onboarding-change",
		words: "Point out an important move once, in the place it happened.",
	},
	{
		name: "When it is used",
		target: "onboarding-inline",
		words: "A small note inside the relevant panel, when you open it.",
	},
	{ name: "A guide to reopen", target: "onboarding-guide", words: "A quiet home for the basics and recent changes." },
];

export default function Frame() {
	return (
		<div className="ob-map">
			<style>{`
.ob-map { height:100%; padding:48px 56px; background:var(--color-bg); color:var(--color-text); font-family:var(--font-sans); }
.ob-map h1 { font-size:36px; font-weight:500; letter-spacing:-1.2px; line-height:1.15; }
.ob-map-intro { font-size:15px; color:var(--color-muted); max-width:760px; line-height:1.7; margin-top:15px; }
.ob-map h2 { font-size:17px; font-weight:500; margin-top:34px; margin-bottom:12px; }
.ob-map-row { display:flex; align-items:center; gap:25px; width:100%; padding:15px 0; text-align:left; border-top:1px solid var(--color-border); cursor:pointer; }
.ob-map-row:hover h3, .ob-map-change:hover h3 { color:var(--color-thread); }
.ob-map-row:focus-visible, .ob-map-change:focus-visible { outline:2px solid var(--color-thread); outline-offset:4px; }
.ob-map-row h3 { font-size:16px; font-weight:500; margin-bottom:5px; transition:color 140ms ease; }
.ob-map-row p { color:var(--color-muted); font-size:12px; line-height:1.5; }
.ob-map-row > div:nth-child(2) { flex:1; }
.ob-map-cost { width:134px; color:var(--color-muted); font-size:11px; }
.ob-map-arrow { color:var(--color-muted); font-size:20px; }
.ob-map-diagram { width:145px; height:62px; position:relative; overflow:hidden; background:var(--color-canvas); border:1px solid var(--color-border-raised); border-radius:4px; flex-shrink:0; }
.ob-map-strip { position:absolute; top:0; right:0; bottom:0; width:18px; background:var(--color-bg); border-left:1px solid var(--color-border); display:flex; flex-direction:column; align-items:center; gap:6px; padding-top:5px; }
.ob-map-strip svg { width:9px; height:9px; color:var(--color-muted); }
.ob-map-sheet { position:absolute; top:10px; left:33px; width:25px; height:40px; border:1px solid var(--color-border-raised); background:var(--color-surface); }
.ob-map-bubble { position:absolute; right:23px; top:17px; width:49px; height:20px; border:1px solid var(--color-thread); border-radius:3px; background:var(--color-bg); }
.ob-map-bubble::before { content:""; position:absolute; right:-6px; top:7px; width:5px; height:1px; background:var(--color-thread); }
.ob-map-labels .ob-map-strip { width:48px; align-items:flex-start; padding-left:5px; }
.ob-map-labels .ob-map-strip::after { content:"Agent"; position:absolute; right:4px; top:19px; font-size:7px; }
.ob-map-open .ob-map-bubble { top:0; right:18px; height:62px; width:51px; border:none; border-left:1px solid var(--color-border-raised); border-radius:0; }
.ob-map-open .ob-map-bubble::before { width:37px; right:7px; top:40px; height:15px; border:1px solid var(--color-border-raised); background:var(--color-surface); border-radius:3px; }
.ob-map-tour .ob-map-sheet { opacity:.4; }
.ob-map-tour .ob-map-bubble { height:28px; }
.ob-map-practice .ob-map-bubble { left:21px; right:auto; top:40px; width:82px; height:15px; border-color:var(--color-border-raised); }
.ob-map-practice .ob-map-bubble::before { width:4px; height:4px; border-radius:50%; top:5px; right:66px; }
.ob-map-changes { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; }
.ob-map-change { text-align:left; border-top:1px solid var(--color-border); padding-top:17px; cursor:pointer; }
.ob-map-change h3 { font-size:14px; font-weight:500; display:flex; justify-content:space-between; }
.ob-map-change p { font-size:12px; color:var(--color-muted); line-height:1.6; margin-top:8px; }
.ob-map-recommendation { border-top:1px solid var(--color-border-raised); margin-top:31px; padding-top:19px; display:flex; gap:30px; font-size:13px; }
.ob-map-recommendation strong { font-weight:500; min-width:120px; }
.ob-map-recommendation p { color:var(--color-muted); line-height:1.65; max-width:650px; }
.ob-map-foot { font:10px var(--font-mono); color:var(--color-muted); margin-top:23px; }
`}</style>
			<h1>Finding your way around spool.</h1>
			<p className="ob-map-intro">
				The first canvas should explain where to start. These directions explore how much to show, when to show it, and
				where help lives after the first visit.
			</p>
			<h2>On the first visit</h2>
			{starts.map((take) => (
				<button type="button" className="ob-map-row" key={take.target} data-go={take.target}>
					<div className={`ob-map-diagram ob-map-${take.kind}`} aria-hidden="true">
						<div className="ob-map-sheet" />
						<div className="ob-map-strip">
							<PropertiesIcon />
							<AgentIcon />
						</div>
						{take.kind !== "labels" && <div className="ob-map-bubble" />}
					</div>
					<div>
						<h3>{take.name}</h3>
						<p>{take.words}</p>
					</div>
					<span className="ob-map-cost">{take.cost}</span>
					<span className="ob-map-arrow">↗</span>
				</button>
			))}
			<h2>When things change later</h2>
			<div className="ob-map-changes">
				{changes.map((take) => (
					<button type="button" key={take.target} className="ob-map-change" data-go={take.target}>
						<h3>
							{take.name}
							<span>↗</span>
						</h3>
						<p>{take.words}</p>
					</button>
				))}
			</div>
			<div className="ob-map-recommendation">
				<strong>My starting point</strong>
				<p>
					The attached hint, with a guide you can reopen. Use a note beside a control only when an update changes where
					something lives. Keep the basics available from help.
				</p>
			</div>
			<p className="ob-map-foot">8 directions · 18 playable states · rows compare takes, columns show later moments</p>
		</div>
	);
}
