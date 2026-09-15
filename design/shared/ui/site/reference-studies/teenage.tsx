import { useState } from "react";
import instrument from "./assets/teenage.jpg";
import "./studies.css";
const details = [
	{ name: "synthesizer", copy: "Start with a sound.", x: 42 },
	{ name: "tape", copy: "Build it in layers.", x: 60 },
	{ name: "mixer", copy: "Find the balance.", x: 80 },
];
export function TeenageStudy() {
	const [selected, setSelected] = useState(0);
	const active = details[selected] ?? details[0];
	return (
		<div className="rs rs-teenage">
			<header>
				<strong>
					teenage
					<br />
					engineering
				</strong>
				<nav>
					<button onClick={() => setSelected(0)}>instrument</button>
					<button onClick={() => setSelected(1)}>recording</button>
					<button onClick={() => setSelected(2)}>mixing</button>
				</nav>
				<span>OP–1 field</span>
			</header>
			<h1>the beauty of evolution.</h1>
			<div className="te-stage">
				<img src={instrument} alt="OP–1 field synthesizer" />
				{details.map((d, i) => (
					<button
						className="te-pin"
						key={d.name}
						style={{ left: `${d.x}%` }}
						aria-pressed={selected === i}
						aria-label={`Explore ${d.name}`}
						onClick={() => setSelected(i)}
					>
						{String(i + 1).padStart(2, "0")}
					</button>
				))}
			</div>
			<footer>
				<span>OP–1 field</span>
				<div>
					<strong>{active?.name}</strong>
					<p>{active?.copy}</p>
				</div>
				<div className="te-controls">
					{details.map((d, i) => (
						<button
							key={d.name}
							onClick={() => setSelected(i)}
							aria-label={`Show ${d.name}`}
							aria-pressed={selected === i}
						>
							{String(i + 1).padStart(2, "0")}
						</button>
					))}
				</div>
			</footer>
		</div>
	);
}
