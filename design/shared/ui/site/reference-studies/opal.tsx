import { useState } from "react";
import table from "./assets/opal.jpg";
import "./studies.css";
const objects = [
	{ name: "Cameras", x: 20, y: 42, text: "A closer look at the objects that started it." },
	{ name: "Colour", x: 77, y: 41, text: "Small objects can have a lot of character." },
	{ name: "Prototypes", x: 76, y: 75, text: "The unfinished ideas are part of the story." },
];
export function OpalStudy() {
	const [active, setActive] = useState<number | null>(null);
	const selected = active === null ? null : objects[active];
	return (
		<div className="rs rs-opal">
			<img src={table} className="opal-table" alt="Objects and camera prototypes on Opal’s studio table" />
			<header>
				<strong>
					opal
					<br />
					electronics
				</strong>
				<button onClick={() => setActive(active === null ? 0 : null)}>
					{active === null ? "Explore the table +" : "Close −"}
				</button>
			</header>
			<div className="opal-copy">
				<h1>{selected ? selected.name : <>the table</>}</h1>
				<p>{selected ? selected.text : "A table full of things worth a closer look."}</p>
			</div>
			{objects.map((object, i) => (
				<button
					key={object.name}
					className="opal-pin"
					style={{ left: `${object.x}%`, top: `${object.y}%` }}
					aria-label={`Explore ${object.name}`}
					aria-pressed={active === i}
					onClick={() => setActive(active === i ? null : i)}
				>
					{active === i ? "−" : "+"}
				</button>
			))}
			<footer>
				<span>Opal Electronics</span>
				<span>Pick something on the table.</span>
			</footer>
		</div>
	);
}
