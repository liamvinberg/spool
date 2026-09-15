import { useState } from "react";
import scene from "./assets/daylight.jpg";
import "./studies.css";
export function DaylightStudy() {
	const [mode, setMode] = useState("Read");
	return (
		<div className="rs rs-daylight">
			<img className="daylight-photo" src={scene} alt="Daylight tablet resting on grass" />
			<header>
				<span className="daylight-logo">daylight</span>
				<nav>
					<button onClick={() => setMode("Read")}>DC–1</button>
					<button onClick={() => setMode("Write")}>A closer look</button>
				</nav>
			</header>
			<div className="daylight-copy">
				<h1>
					The computer,
					<br />
					de-invented.
				</h1>
				<p>
					A different kind of screen.
					<br />
					Take a moment with DC–1.
				</p>
			</div>
			<div className="daylight-mode">
				<div>
					<span>
						{mode === "Read"
							? "A page at your own pace."
							: mode === "Write"
								? "A place for the next thought."
								: "Room to see the whole idea."}
					</span>
					<small>Explore the screen</small>
				</div>
				<div>
					{["Read", "Write", "Draw"].map((m) => (
						<button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
							{m}
						</button>
					))}
				</div>
			</div>
			{mode !== "Read" && (
				<div className="daylight-paper">
					{mode === "Write" ? (
						<textarea aria-label="Write a thought" placeholder="What’s on your mind?" />
					) : (
						<div className="daylight-draw">
							<span>Make a mark.</span>
							<input
								type="color"
								aria-label="Ink colour"
								defaultValue="#375239"
								onChange={(e) => e.currentTarget.parentElement?.style.setProperty("color", e.target.value)}
							/>
							<svg viewBox="0 0 200 120">
								<path
									d="M12 96Q45 5 78 80T137 45T184 85M40 104Q95 43 160 98"
									fill="none"
									stroke="currentColor"
									strokeWidth="3"
								/>
							</svg>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
