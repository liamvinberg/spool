import { useState } from "react";
import "./examples.css";

function Arrow({ back = false }: { back?: boolean }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={back ? { transform: "rotate(180deg)" } : undefined}>
			<path
				d="M4 12h15m-6-6 6 6-6 6"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function FieldworkWebsite() {
	const [project, setProject] = useState(false);
	return (
		<div className="fw-site">
			<header>
				<button type="button" onClick={() => setProject(false)}>
					fieldwork<span>®</span>
				</button>
				<nav>
					<button type="button" onClick={() => setProject(true)}>
						Selected work
					</button>
					<span>Spaces for everyday life.</span>
				</nav>
			</header>
			<main>
				<div>
					<h1>
						{project ? (
							<>
								A room for
								<br />
								the neighbourhood.
							</>
						) : (
							<>
								Good places.
								<br />
								Ordinary days.
							</>
						)}
					</h1>
					<p>
						{project
							? "A former workshop becomes a place to read, meet, and spend an unhurried afternoon. Built around the people who already call this place home."
							: "We design places that bring people together. Small buildings, shared gardens, and the spaces in between."}
					</p>
					<button type="button" onClick={() => setProject(!project)}>
						{project ? "Back to the studio" : "Explore the garden room"}
						<Arrow back={project} />
					</button>
				</div>
				<div className="fw-building" role="img" aria-label="Architectural illustration of a sunlit garden room">
					<div className="fw-sun" />
					<div className="fw-ground" />
					<div className="fw-wall">
						<i />
						<i />
						<i />
					</div>
					<div className="fw-roof" />
					<div className="fw-tree" />
				</div>
			</main>
			<footer>
				<span>{project ? "The garden room, Stockholm" : "Independent architecture & landscape"}</span>
				<span>Stockholm, Sweden</span>
				<span>2026</span>
			</footer>
		</div>
	);
}

const SLIDES = [
	{
		title: (
			<>
				Small places.
				<br />
				Big possibilities.
			</>
		),
		body: "A proposal for the spaces between buildings.",
		note: "Fieldwork · The neighbourhood project",
	},
	{
		title: (
			<>
				Start with
				<br />
				what’s here.
			</>
		),
		body: "A little shade. Somewhere to sit. A reason to stay. The best starting point is the life already happening around us.",
		note: "An approach built around everyday life",
	},
	{
		title: (
			<>
				Make room
				<br />
				for each other.
			</>
		),
		body: "Turn an unused courtyard into a shared garden, with a room that stays open through the seasons.",
		note: "The garden room · A place to begin",
	},
] as const;

export function FieldworkPresentation() {
	const [slide, setSlide] = useState(0);
	const current = SLIDES[slide] ?? SLIDES[0];
	return (
		<div
			className={`fw-deck fw-slide-${slide}`}
			tabIndex={0}
			aria-label="Fieldwork presentation"
			onKeyDown={(event) => {
				if (event.key === "ArrowRight") {
					event.preventDefault();
					setSlide((value) => Math.min(2, value + 1));
				}
				if (event.key === "ArrowLeft") {
					event.preventDefault();
					setSlide((value) => Math.max(0, value - 1));
				}
			}}
		>
			<header>
				<span>fieldwork®</span>
				<span>The neighbourhood project</span>
			</header>
			<main aria-live="polite">
				<h1>{current.title}</h1>
				<p>{current.body}</p>
			</main>
			<div className="fw-deck-art" aria-hidden="true">
				<i />
				<i />
				<i />
				<i />
			</div>
			<footer>
				<span>{current.note}</span>
				<div>
					<button type="button" aria-label="Previous slide" disabled={slide === 0} onClick={() => setSlide(slide - 1)}>
						<Arrow back />
					</button>
					<span>{String(slide + 1).padStart(2, "0")} / 03</span>
					<button type="button" aria-label="Next slide" disabled={slide === 2} onClick={() => setSlide(slide + 1)}>
						<Arrow />
					</button>
				</div>
			</footer>
		</div>
	);
}
