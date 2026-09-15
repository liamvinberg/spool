import { useState } from "react";
import a from "./assets/cosmos-0.jpg";
import b from "./assets/cosmos-1.jpg";
import c from "./assets/cosmos-2.jpg";
import d from "./assets/cosmos-4.jpg";
import e from "./assets/cosmos-5.jpg";
import f from "./assets/cosmos-7.jpg";
import "./studies.css";
const images = [a, b, c, d, e, f];
export function CosmosStudy() {
	const [collected, setCollected] = useState<number[]>([]);
	const [view, setView] = useState(false);
	return (
		<div className="rs rs-cosmos">
			<header>
				<strong>cosmos</strong>
				<button onClick={() => setView(!view)}>
					{view ? "Explore again" : "Your collection"} <span>{collected.length}</span>
				</button>
			</header>
			<div className="cosmos-heading">
				<h1>
					{view ? (
						<>
							What caught
							<br />
							your eye.
						</>
					) : (
						<>
							Your space
							<br />
							for inspiration.
						</>
					)}
				</h1>
				<p>{view ? "A collection, started by you." : "Collect a few things you want to come back to."}</p>
			</div>
			<div className="cosmos-images" data-collection={view}>
				{images.map(
					(src, i) =>
						(!view || collected.includes(i)) && (
							<button
								key={src}
								aria-label={`Collect reference ${i + 1}`}
								aria-pressed={collected.includes(i)}
								className={`cosmos-image cosmos-image-${i}`}
								onClick={() =>
									setCollected((old) => (old.includes(i) ? old.filter((x) => x !== i) : [...old, i]))
								}
							>
								<img src={src} alt={`Cosmos visual reference ${i + 1}`} />
								<span>{collected.includes(i) ? "Collected" : "+ Collect"}</span>
							</button>
						),
				)}
			</div>
			<footer>
				<span>Images lead. Connections follow.</span>
				<button onClick={() => setView(!view)}>
					{view ? "Back to exploring" : "Open your collection"}
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M5 19 19 5M5 5h14v14" fill="none" stroke="currentColor" strokeWidth="1.5" />
					</svg>
				</button>
			</footer>
		</div>
	);
}
