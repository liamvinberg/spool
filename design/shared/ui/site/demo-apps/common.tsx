import { useState } from "react";
import courtyard from "./assets/courtyard.jpg";
import table from "./assets/table.jpg";
import dining from "./assets/dining.jpg";
import { cn } from "shared/lib/utils";
import "./common.css";

const PLACES = [
	{
		name: "Bower",
		kind: "Coffee",
		note: "Coffee, sunlight, a little longer.",
		street: "12 Willow Lane",
		walk: "4 min",
		photo: courtyard,
		x: 48,
		y: 45,
	},
	{
		name: "Sunday Table",
		kind: "Food",
		note: "A very good reason to stay for lunch.",
		street: "6 Market Street",
		walk: "8 min",
		photo: table,
		x: 72,
		y: 65,
	},
	{
		name: "Bar Clementine",
		kind: "Food",
		note: "One small plate turns into an evening.",
		street: "24 River Walk",
		walk: "12 min",
		photo: dining,
		x: 26,
		y: 71,
	},
] as const;

export function Common({
	screen,
	place = 0,
	saved = false,
	onOpen,
	onSave,
	onBack,
	onCollection,
}: {
	screen: "explore" | "place" | "saved";
	place?: number;
	saved?: boolean;
	onOpen: (place: number) => void;
	onSave: () => void;
	onBack: () => void;
	onCollection: () => void;
}) {
	const [filter, setFilter] = useState("All places");
	const [zoom, setZoom] = useState(false);
	const selected = PLACES[place] ?? PLACES[0];
	return (
		<div className="cm-app" data-screen={screen}>
			<header className="cm-header">
				<button type="button" className="cm-brand" onClick={onBack}>
					<span>✳</span> common
				</button>
				<span>A city is better with a few good places.</span>
				<button type="button" className="cm-collection-button" onClick={onCollection}>
					Your places <span>{saved ? 3 : 2}</span>
				</button>
				<span className="cm-avatar">J</span>
			</header>
			<main className="cm-layout">
				<section className="cm-panel">
					{screen === "explore" ? (
						<>
							<div className="cm-intro">
								<h1>
									A good day,
									<br />
									close by.
								</h1>
								<p>
									Around Riverside <span>↘</span>
								</p>
							</div>
							<div className="cm-filters" aria-label="Filter places">
								{["All places", "Coffee", "Food"].map((name) => (
									<button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>
										{name}
									</button>
								))}
							</div>
							<div className="cm-places">
								{PLACES.map((item, i) =>
									filter === "All places" || filter === item.kind ? (
										<button className="cm-place-row" type="button" key={item.name} onClick={() => onOpen(i)}>
											<img src={item.photo} alt={item.name} style={{ viewTransitionName: `common-photo-${i}` }} />
											<span>
												<strong>{item.name}</strong>
												<small>
													{item.kind} · {item.walk} walk
												</small>
												<span>{item.note}</span>
											</span>
											<span className="cm-row-arrow">↗</span>
										</button>
									) : null,
								)}
							</div>
							<div className="cm-local-note">
								<span>↳</span>
								<p>
									For the places you go back to.
									<br />
									And the ones you haven’t found yet.
								</p>
							</div>
						</>
					) : screen === "place" ? (
						<>
							<button className="cm-back" type="button" onClick={onBack}>
								← All places
							</button>
							<div className="cm-detail-photo">
								<img src={selected.photo} alt={selected.name} style={{ viewTransitionName: `common-photo-${place}` }} />
								<span>
									{selected.kind} · {selected.walk} from you
								</span>
							</div>
							<div className="cm-detail-copy">
								<h1>{selected.name}</h1>
								<p>{selected.note}</p>
								<div className="cm-address">
									<span>↗</span>
									<div>
										{selected.street}
										<small>Riverside · Open until 18:00</small>
									</div>
								</div>
								<p className="cm-description">
									A corner worth keeping. Take the seat by the window, order something good, and let the afternoon find
									its own pace.
								</p>
								<button type="button" className="cm-primary" onClick={onSave}>
									<span>{saved ? "✓" : "+"}</span>
									{saved ? "View in Saturday, slowly" : "Save to Saturday, slowly"}
									<span>↗</span>
								</button>
							</div>
						</>
					) : (
						<>
							<button className="cm-back" type="button" onClick={onBack}>
								← Back to exploring
							</button>
							<div className="cm-collection-heading">
								<span className="cm-folder-icon">↳</span>
								<h1>
									Saturday,
									<br />
									slowly.
								</h1>
								<p>{saved ? "Three" : "Two"} places. All the time in the world.</p>
							</div>
							<div className="cm-saved-status" role="status">
								{saved ? (
									<>
										<span>✓</span> {selected.name} is on your list.
									</>
								) : (
									<>Your small collection of good places.</>
								)}
							</div>
							{(saved
								? [
										selected,
										{ name: "Fern Books", kind: "Books", note: "Get lost for a while.", photo: table },
										{ name: "Riverside Gardens", kind: "Outside", note: "The long way home.", photo: courtyard },
									]
								: [
										{ name: "Fern Books", kind: "Books", note: "Get lost for a while.", photo: table },
										{ name: "Riverside Gardens", kind: "Outside", note: "The long way home.", photo: courtyard },
									]
							).map((item, i) => (
								<div className="cm-saved-row" key={item.name}>
									<span>{String(i + 1).padStart(2, "0")}</span>
									<img src={item.photo} alt="" />
									<div>
										<h2>{item.name}</h2>
										<p>{item.note}</p>
									</div>
									{saved && i === 0 ? (
										<button type="button" aria-label={`Open ${selected.name}`} onClick={() => onOpen(place)}>
											↗
										</button>
									) : null}
								</div>
							))}
							<button className="cm-add-place" type="button" onClick={onBack}>
								+ Find one more place
							</button>
						</>
					)}
				</section>
				<section className="cm-map" aria-label="Illustrated neighbourhood map">
					<div className={cn("cm-map-world", zoom && "cm-map-zoomed")}>
						<svg
							className="cm-map-drawing"
							viewBox="0 0 760 760"
							fill="none"
							role="img"
							aria-label="Riverside, with parks, water, and three nearby places"
						>
							<rect width="760" height="760" fill="#eedbd0" />
							<path d="M490-70C340 160 600 280 468 450S450 680 300 810" stroke="#abc1bd" strokeWidth="126" />
							<path
								d="M-80 280 900 510M-50 665 900 86M90-100 350 900M640-100 48 930M-60 470 740 770M-10 105 850 270"
								stroke="#d7beb0"
								strokeWidth="22"
							/>
							<path
								d="M-80 280 900 510M-50 665 900 86M90-100 350 900M640-100 48 930M-60 470 740 770M-10 105 850 270"
								stroke="#f9eee3"
								strokeWidth="15"
							/>
							<path
								d="m43 338 90 20 34 95-83-26Z M588 437l83 30-48 66-60-19Z M191 82l90 25-43 83-70-21Z"
								fill="#bac2a3"
							/>
							<path
								d="m348 8-29 216M19 205l300 70M92 580l239 92M533 122l111 617M201 333l-44 169M467 648l241-168M343 487l-81 257"
								stroke="#f9eee3"
								strokeWidth="8"
							/>
							<g fill="#a68b7c" fontSize="12" letterSpacing="2">
								<text x="96" y="238" transform="rotate(14 96 238)">
									WILLOW LANE
								</text>
								<text x="483" y="606" transform="rotate(-32 483 606)">
									RIVER WALK
								</text>
								<text x="502" y="240" transform="rotate(14 502 240)">
									MARKET STREET
								</text>
							</g>
						</svg>
						<span className="cm-neighbourhood cm-north">Old town</span>
						<span className="cm-neighbourhood cm-south">Riverside</span>
						<span className="cm-park">
							Willow
							<br />
							Gardens
						</span>
						{PLACES.map((item, i) => (
							<button
								type="button"
								className={cn("cm-pin", screen !== "explore" && i === place && "cm-pin-selected")}
								style={{ left: `${item.x}%`, top: `${item.y}%` }}
								key={item.name}
								onClick={() => onOpen(i)}
								aria-label={`Open ${item.name} on the map`}
							>
								<span>{screen === "saved" && i === place ? "✓" : item.kind === "Coffee" ? "☕" : "✳"}</span>
								<strong>{item.name}</strong>
							</button>
						))}
						<span className="cm-you">
							<i />
						</span>
					</div>
					<div className="cm-map-top">
						<span>
							<i /> A few local favourites
						</span>
						<button type="button" aria-label={zoom ? "Zoom out" : "Zoom in"} onClick={() => setZoom(!zoom)}>
							{zoom ? "−" : "+"}
						</button>
					</div>
					<div className="cm-map-bottom">
						<span>Good places bring us together.</span>
						<span className="cm-compass">N ↑</span>
					</div>
				</section>
			</main>
		</div>
	);
}
