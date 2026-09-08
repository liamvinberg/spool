import { useState } from "react";
import { cn } from "../../../lib/utils";
import "./offprint.css";

function Print({ small = false }: { small?: boolean }) {
	return (
		<div className={cn("op-print", small && "op-print-small")}>
			<div className="op-print-type">
				Make
				<br />a little
				<br />
				<em>mess.</em>
			</div>
			<div className="op-print-art">
				<i />
				<i />
				<i />
				<i />
			</div>
			<span className="op-print-number">No. 014</span>
			<span className="op-print-foot">Good things happen by hand.</span>
		</div>
	);
}

export function Offprint({
	screen,
	time = "10:00",
	seats = 1,
	onOpen,
	onBook,
	onBack,
}: {
	screen: "workshops" | "booking" | "ticket";
	time?: string;
	seats?: number;
	onOpen: () => void;
	onBook: (time: string, seats: number) => void;
	onBack: () => void;
}) {
	const [chosenTime, setTime] = useState(time);
	const [people, setPeople] = useState(seats);
	const [reminder, setReminder] = useState(false);
	return (
		<div className="op-app" data-screen={screen}>
			<header className="op-header">
				<button type="button" className="op-brand" onClick={onBack}>
					<span>offprint</span>
					<i>✳</i>
				</button>
				<nav aria-label="Workshop navigation">
					<button type="button" aria-current={screen !== "ticket" ? "page" : undefined} onClick={onBack}>
						Workshops
					</button>
					<button
						type="button"
						aria-current={screen === "ticket" ? "page" : undefined}
						onClick={() => onBook(chosenTime, people)}
					>
						Your bookings <span>1</span>
					</button>
				</nav>
				<span className="op-city">
					Stockholm <span>↙</span>
				</span>
				<span className="op-avatar">J</span>
			</header>
			{screen === "workshops" ? (
				<main className="op-workshops">
					<div className="op-title-row">
						<h1>
							Less scrolling.
							<br />
							More making.
						</h1>
						<p>
							Good company. Something new.
							<br />A Saturday well spent.
						</p>
					</div>
					<div className="op-featured">
						<button
							type="button"
							className="op-poster-button"
							onClick={onOpen}
							aria-label="Explore the screen printing workshop"
						>
							<Print />
							<span className="op-poster-arrow">↗</span>
						</button>
						<section className="op-workshop-copy">
							<div className="op-workshop-date">
								<span>Sat</span>
								<strong>19</strong>
								<span>September</span>
							</div>
							<div>
								<h2>
									Pull your
									<br />
									first print.
								</h2>
								<p>
									Two colours. A little ink. A print that’s yours.
									<br />
									An easy morning in the studio with Bea.
								</p>
							</div>
							<div className="op-details-line">
								<span>↗ Södermalm</span>
								<span>2.5 hours</span>
								<span>All levels</span>
							</div>
							<button type="button" className="op-primary" onClick={onOpen}>
								Find your seat <span>↗</span>
							</button>
							<div className="op-seats-note">
								<span>
									<i />
									<i />
									<i />
								</span>
								Six seats left at the big table.
							</div>
						</section>
					</div>
					<footer className="op-workshops-footer">
						<span>Come curious. Leave with something you made.</span>
						<span>All materials included ↗</span>
					</footer>
				</main>
			) : screen === "booking" ? (
				<main className="op-booking">
					<button type="button" className="op-back" onClick={onBack}>
						← All workshops
					</button>
					<div className="op-booking-layout">
						<section className="op-booking-left">
							<div className="op-booking-poster">
								<Print />
							</div>
							<div className="op-host">
								<span className="op-host-avatar">B</span>
								<div>
									<strong>Spend a morning with Bea.</strong>
									<p>Printmaker. Patient teacher. Believer in happy accidents.</p>
								</div>
								<span>↗</span>
							</div>
						</section>
						<section className="op-booking-form">
							<h1>
								Pull your
								<br />
								first print.
							</h1>
							<p>
								Saturday 19 September
								<br />
								Studio 14, Södermalm · 2.5 hours
							</p>
							<fieldset>
								<legend>Pick a time</legend>
								<div className="op-time-options">
									{["10:00", "14:00"].map((item) => (
										<button
											type="button"
											key={item}
											aria-pressed={chosenTime === item}
											onClick={() => setTime(item)}
										>
											<strong>{item}</strong>
											<span>{item === "10:00" ? "A slow morning" : "An easy afternoon"}</span>
										</button>
									))}
								</div>
							</fieldset>
							<div className="op-seat-stepper">
								<div>
									<strong>A seat for you.</strong>
									<span>And someone you like?</span>
								</div>
								<div>
									<button
										type="button"
										aria-label="Fewer seats"
										disabled={people === 1}
										onClick={() => setPeople((n) => n - 1)}
									>
										−
									</button>
									<output aria-live="polite">{people}</output>
									<button
										type="button"
										aria-label="More seats"
										disabled={people >= 4}
										onClick={() => setPeople((n) => n + 1)}
									>
										+
									</button>
								</div>
							</div>
							<div className="op-total">
								<span>Everything included</span>
								<strong>
									{people * 650} <small>kr</small>
								</strong>
							</div>
							<button type="button" className="op-primary" onClick={() => onBook(chosenTime, people)}>
								Count me in <span>↗</span>
							</button>
							<small className="op-booking-foot">Ink, paper, coffee. Just bring yourself.</small>
						</section>
					</div>
				</main>
			) : (
				<main className="op-confirmation">
					<section className="op-confirmation-copy">
						<span className="op-check">✓</span>
						<h1>
							Your Saturday
							<br />
							has a plan.
						</h1>
						<p>
							We’ve saved {seats === 1 ? "you a seat" : `${seats} seats`} at the big table.
							<br />
							The ink and coffee are on us.
						</p>
						<button
							type="button"
							className={cn("op-reminder", reminder && "op-reminder-set")}
							aria-pressed={reminder}
							onClick={() => setReminder(!reminder)}
						>
							{reminder ? "✓ Reminder is set" : "+ Remind me the day before"}
						</button>
						<button type="button" className="op-back" onClick={onBack}>
							Back to workshops ↗
						</button>
					</section>
					<section className="op-ticket" aria-label="Workshop booking">
						<div className="op-ticket-top">
							<span>offprint ✳</span>
							<span>You’re in.</span>
						</div>
						<div className="op-ticket-poster">
							<Print small />
						</div>
						<div className="op-ticket-info">
							<h2>Pull your first print.</h2>
							<div>
								<span>
									Saturday 19 September
									<strong>
										{time} – {chosenTime === "14:00" ? "16:30" : "12:30"}
									</strong>
								</span>
								<span>
									{seats === 1 ? "One seat" : `${seats} seats`}
									<strong>Studio 14</strong>
								</span>
							</div>
							<p>Södermalm, Stockholm</p>
						</div>
						<div className="op-ticket-perforation" />
						<div className="op-ticket-bottom">
							<span>See you at the studio.</span>
							<span>№ 0014</span>
						</div>
					</section>
				</main>
			)}
		</div>
	);
}
