import { useState } from "react";
import campaign from "./assets/nothing.jpg";
import "./studies.css";
export function NothingStudy() {
	const [open, setOpen] = useState(false);
	return (
		<div className="rs rs-nothing">
			<img
				className="nothing-photo"
				src={campaign}
				alt="Nothing Ear campaign, pink earbud against a yellow background"
			/>
			<header>
				<strong>NOTHING (R)</strong>
				<button onClick={() => setOpen(!open)}>{open ? "CLOSE (−)" : "EXPLORE (+)"}</button>
			</header>
			<div className="nothing-title">
				<h1>ear (3a)</h1>
				<p>Capture sound with Audio Snapshot.</p>
			</div>
			<button className="nothing-discover" onClick={() => setOpen(!open)}>
				Discover Ear (3a)
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M5 19 19 5M5 5h14v14" fill="none" stroke="currentColor" strokeWidth="1.5" />
				</svg>
			</button>
			{open && (
				<section className="nothing-panel">
					<div>
						<h2>
							Audio
							<br />
							Snapshot.
						</h2>
						<p>A sound you want to come back to.</p>
					</div>
					<button onClick={() => setOpen(false)}>Back to the campaign ←</button>
				</section>
			)}
		</div>
	);
}
