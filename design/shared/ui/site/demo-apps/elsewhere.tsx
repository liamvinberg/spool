import { useState } from "react";
import coast from "shared/assets/desktop/coast.jpg";
import { cn } from "shared/lib/utils";
import "./elsewhere.css";

// Three-screen prototype: can planning a small trip make the landing demo feel alive?
export function Elsewhere({
	screen,
	date = "18–21 Sep",
	guests = 2,
	onOpen,
	onPlan,
	onBack,
}: {
	screen: "discover" | "stay" | "plan";
	date?: string;
	guests?: number;
	onOpen: () => void;
	onPlan: (date: string, guests: number) => void;
	onBack: () => void;
}) {
	const [chosenDate, setDate] = useState(date);
	const [people, setPeople] = useState(guests);
	const [packed, setPacked] = useState(false);
	return (
		<div className="ew-app" data-screen={screen}>
			<aside className="ew-rail">
				<button type="button" className="ew-mark" onClick={onBack} aria-label="Elsewhere home">
					e.
				</button>
				<span className="ew-rail-line" />
				<span className="ew-rail-active" title="Discover">
					↗
				</span>
				<span className="ew-rail-vertical">A little further from ordinary.</span>
				<span className="ew-avatar">J</span>
			</aside>
			<div className="ew-body">
				<header className="ew-header">
					<span className="ew-wordmark">elsewhere</span>
					<nav aria-label="Trip navigation">
						<button type="button" aria-current={screen === "discover" ? "page" : undefined} onClick={onBack}>
							Discover
						</button>
						<button
							type="button"
							aria-current={screen === "plan" ? "page" : undefined}
							onClick={() => onPlan(chosenDate, people)}
						>
							Your trips <span>1</span>
						</button>
					</nav>
					<span>Good afternoon, Jules.</span>
				</header>
				{screen === "discover" ? (
					<main className="ew-discover">
						<div className="ew-heading">
							<h1>Your next somewhere.</h1>
							<span>Small trips. Room to breathe.</span>
						</div>
						<button className="ew-destination" type="button" onClick={onOpen} aria-label="Explore The coast house">
							<img src={coast} alt="A quiet concrete house above a deep blue sea" className="ew-coast" />
							<div className="ew-photo-shade" />
							<span className="ew-photo-location">38° N · 8° W</span>
							<div className="ew-destination-copy">
								<h2>
									A long weekend,
									<br />a little further.
								</h2>
								<span>The coast house · Arrábida, Portugal</span>
							</div>
							<span className="ew-round-arrow">↗</span>
						</button>
						<div className="ew-discover-footer">
							<div>
								<span className="ew-tiny-coast">≈</span>
								<div>
									<h3>Less planning. More being there.</h3>
									<p>A place to stay, a few good stops, and time for nothing.</p>
								</div>
							</div>
							<button type="button" className="ew-text-button" onClick={onOpen}>
								Make a weekend of it <span>↗</span>
							</button>
						</div>
					</main>
				) : screen === "stay" ? (
					<main className="ew-stay">
						<button type="button" className="ew-back" onClick={onBack}>
							← Back to discovering
						</button>
						<div className="ew-stay-title">
							<h1>The coast house</h1>
							<span>Arrábida, Portugal · 40 minutes from Lisbon</span>
						</div>
						<div className="ew-stay-layout">
							<div className="ew-stay-photo">
								<img src={coast} alt="The coast house overlooking the sea" className="ew-coast" />
								<span>Somewhere to do very little.</span>
							</div>
							<section className="ew-booking" aria-label="Plan your weekend">
								<h2>Make it a weekend.</h2>
								<p>
									Three nights by the sea.
									<br />
									The rest can wait.
								</p>
								<fieldset>
									<legend>When are you going?</legend>
									<div className="ew-dates">
										{["18–21 Sep", "25–28 Sep"].map((item) => (
											<button type="button" key={item} aria-pressed={item === chosenDate} onClick={() => setDate(item)}>
												{item}
											</button>
										))}
									</div>
								</fieldset>
								<div className="ew-guests">
									<span>People</span>
									<div>
										<button
											type="button"
											aria-label="Fewer people"
											disabled={people <= 1}
											onClick={() => setPeople((n) => n - 1)}
										>
											−
										</button>
										<output aria-live="polite">{people}</output>
										<button
											type="button"
											aria-label="More people"
											disabled={people >= 4}
											onClick={() => setPeople((n) => n + 1)}
										>
											+
										</button>
									</div>
								</div>
								<div className="ew-price">
									<strong>€145</strong>
									<span> / night</span>
									<small>Entire house · sleeps four</small>
								</div>
								<button type="button" className="ew-primary" onClick={() => onPlan(chosenDate, people)}>
									Add to my trip <span>↗</span>
								</button>
								<small>Just a plan for now. Book when you’re ready.</small>
							</section>
							<div className="ew-amenities">
								<span>↗ A path to the sea</span>
								<span>☀ South-facing terrace</span>
								<span>◌ Space to switch off</span>
							</div>
						</div>
					</main>
				) : (
					<main className="ew-plan">
						<div className="ew-heading">
							<div>
								<h1>A little further.</h1>
								<p>
									Arrábida · {date} · {guests} {guests === 1 ? "person" : "people"}
								</p>
							</div>
							<span className="ew-saved">
								<i /> Your weekend is taking shape
							</span>
						</div>
						<div className="ew-plan-layout">
							<div className="ew-plan-photo">
								<img src={coast} alt="Your stay at The coast house" className="ew-coast" />
								<div>
									<h2>The coast house</h2>
									<span>Three nights to call it home.</span>
									<button type="button" onClick={onOpen}>
										Edit stay ↗
									</button>
								</div>
							</div>
							<section className="ew-itinerary">
								<h2>A few good plans.</h2>
								<p>Leave the in-between open.</p>
								{[
									{
										day: "Friday",
										title: "Take the long way down.",
										text: "Pick up the keys. Find the terrace. Stay a while.",
										icon: "↘",
									},
									{
										day: "Saturday",
										title: "Follow the water.",
										text: "A morning swim and lunch in the old harbour.",
										icon: "≈",
									},
									{
										day: "Sunday",
										title: "Absolutely nothing.",
										text: "A second coffee. One more chapter.",
										icon: "☀",
									},
								].map((item) => (
									<div className="ew-day" key={item.day}>
										<span className="ew-day-icon">{item.icon}</span>
										<div>
											<span>{item.day}</span>
											<h3>{item.title}</h3>
											<p>{item.text}</p>
										</div>
									</div>
								))}
								<button
									type="button"
									className={cn("ew-packing", packed && "ew-packed")}
									aria-pressed={packed}
									onClick={() => setPacked(!packed)}
								>
									<span>{packed ? "✓" : "+"}</span>
									{packed ? "Swimwear is on your packing list" : "Remember to pack swimwear"}
								</button>
							</section>
						</div>
					</main>
				)}
			</div>
		</div>
	);
}
