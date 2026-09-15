import { useState } from "react";
import device from "./assets/playdate.jpg";
import "./studies.css";
export function PlaydateStudy() {
	const [turn, setTurn] = useState(0);
	const [playing, setPlaying] = useState(false);
	return (
		<div className="rs rs-playdate">
			<header>
				<strong>playdate</strong>
				<button onClick={() => setPlaying(!playing)}>{playing ? "Back to Playdate" : "Try a little game"} +</button>
			</header>
			<main>
				<div className="playdate-copy">
					<h1>
						A tiny
						<br />
						handheld
						<br />
						game system.
					</h1>
					<p>
						A pocket-sized game system.
						<br />
						With a crank. Naturally.
					</p>
					<button onClick={() => setPlaying(!playing)}>
						{playing ? "That was fun. Again?" : "Give it a turn"}{" "}
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M5 19 19 5M5 5h14v14" fill="none" stroke="currentColor" strokeWidth="1.5" />
						</svg>
					</button>
				</div>
				<div className="playdate-product">
					<img src={device} alt="The yellow Playdate handheld game console" />
					{playing && (
						<div className="playdate-screen">
							<span>TURN TO EXPLORE</span>
							<div className="playdate-track">
								<div style={{ left: `${10 + (turn % 8) * 10}%`, bottom: `${16 + Math.sin(turn) * 20}%` }} />
								<span style={{ left: "70%" }}>★</span>
							</div>
							<strong>{turn >= 6 ? "NICE ONE!" : `${turn} TURNS`}</strong>
						</div>
					)}
					<label className="playdate-crank">
						{playing ? "Turn the crank" : "Go on. It really turns."}
						<input
							type="range"
							aria-label="Turn the crank"
							min="0"
							max="24"
							value={turn}
							onChange={(e) => {
								setPlaying(true);
								setTurn(Number(e.target.value));
							}}
						/>
					</label>
				</div>
			</main>
			<footer>
				<span>Designed for the fun of it.</span>
				<span>Playdate by Panic</span>
			</footer>
		</div>
	);
}
