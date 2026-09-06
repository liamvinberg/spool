import coast from "shared/assets/desktop/coast.jpg";
import "./source.css";

export type CaptureTarget = "photo" | "card" | "stays" | "page";

export const TARGETS: readonly CaptureTarget[] = ["photo", "card", "stays", "page"];
export const TARGET_LABEL: Record<CaptureTarget, string> = {
	photo: "Stay photo",
	card: "Stay card",
	stays: "Stays",
	page: "Whole website page",
};
export const TARGET_SIZE: Record<CaptureTarget, { w: number; h: number }> = {
	photo: { w: 384, h: 230 },
	card: { w: 384, h: 424 },
	stays: { w: 1200, h: 424 },
	page: { w: 1440, h: 1350 },
};

// A fictional source website. The same document and card render on both sides
// of the mock handoff, so the proposal changes only spool's controls.
export function StayCard({ index = 1, incomplete = false }: { index?: number; incomplete?: boolean }) {
	const names = ["The headland house", "A cabin by the water", "A slower kind of Sunday"];
	return (
		<article className="sund-card" data-capture="card" data-card-index={index}>
			{incomplete ? (
				<div className="sund-missing">Image unavailable</div>
			) : (
				<img
					data-capture="photo"
					data-card-index={index}
					src={coast}
					alt="A quiet coast with islands and blue water"
					style={{ objectPosition: `${index * 45}% 55%` }}
				/>
			)}
			<div className="sund-card-copy">
				<div className="sund-place">
					<span>Stockholm archipelago</span>
					<span>↗</span>
				</div>
				<h2>{names[index] ?? names[1]}</h2>
				<p>Two people. A wood stove. Nowhere to be.</p>
				<div className="sund-book">
					<span>
						From <strong>1,850 kr</strong> / night
					</span>
					<button type="button">
						View stay <span>→</span>
					</button>
				</div>
			</div>
		</article>
	);
}

export function StayRow({ incomplete = false, cardIndex = 1 }: { incomplete?: boolean; cardIndex?: number }) {
	return (
		<div className="sund-stays" data-capture="stays">
			{[0, 1, 2].map((index) => (
				<StayCard key={index} index={index} incomplete={incomplete && index === cardIndex} />
			))}
		</div>
	);
}

export function SourceWebsite({ incomplete = false, cardIndex = 1 }: { incomplete?: boolean; cardIndex?: number }) {
	return (
		<div className="sund sund-document" data-capture="page">
			<header className="sund-nav">
				<span className="sund-wordmark">Sund</span>
				<nav>
					<span>Find a stay</span>
					<span>Our places</span>
					<span>The journal</span>
				</nav>
				<span>
					Saved stays <span>♡</span>
				</span>
			</header>
			<main>
				<div className="sund-intro">
					<h1>
						A little further
						<br />
						from everything.
					</h1>
					<p>
						Places to switch off, slow down,
						<br />
						and stay a little longer.
						<br />
						<span>Handpicked around the Swedish coast.</span>
					</p>
				</div>
				<div className="sund-section-label">
					<span>Somewhere for the weekend</span>
					<span>
						All stays <span>↗</span>
					</span>
				</div>
				<StayRow incomplete={incomplete} cardIndex={cardIndex} />
				<div className="sund-journal">
					<div className="sund-film">
						<img src={coast} alt="The archipelago, a moment from the film" />
						<span>▷</span>
					</div>
					<div>
						<h2>
							Room to do
							<br />a little less.
						</h2>
						<p>
							A ferry out. A walk with no destination.
							<br />A long lunch that turns into dinner.
						</p>
						<span>Meet the people behind our places ↗</span>
					</div>
				</div>
			</main>
			<footer className="sund-footer">
				<span className="sund-wordmark">Sund</span>
				<span>A good place to be.</span>
				<span>Instagram</span>
				<span>Get in touch</span>
				<span>© Sund 2026</span>
			</footer>
		</div>
	);
}

export function CapturedContent({
	target,
	incomplete = false,
	cardIndex = 1,
}: {
	target: CaptureTarget;
	incomplete?: boolean;
	cardIndex?: number;
}) {
	if (target === "page") return <SourceWebsite incomplete={incomplete} cardIndex={cardIndex} />;
	return (
		<div className="sund" style={{ width: TARGET_SIZE[target].w }}>
			{target === "stays" ? (
				<StayRow incomplete={incomplete} cardIndex={cardIndex} />
			) : target === "card" ? (
				<StayCard incomplete={incomplete} index={cardIndex} />
			) : incomplete ? (
				<div className="sund-missing">Image unavailable</div>
			) : (
				<img
					className="sund-photo"
					src={coast}
					alt="A quiet coast with islands and blue water"
					style={{ objectPosition: `${cardIndex * 45}% 55%` }}
				/>
			)}
		</div>
	);
}
