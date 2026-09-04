import { cn } from "shared/lib/utils";
import { RestaurantService } from "./showcase";
import "./fire.css";

type FireTake = "hearth" | "gathering" | "kindling" | "supper";

function Flame({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 48 64" fill="none" aria-hidden="true">
			<path
				d="M27 1C31 20 45 26 45 41C45 54 36 63 24 63C11 63 3 54 3 43C3 30 13 25 14 14C21 20 22 26 21 30C28 23 30 15 27 1Z"
				fill="currentColor"
			/>
			<path
				d="M26 32C25 43 16 44 16 51C16 57 20 60 25 60C32 60 35 55 34 50C34 42 28 39 26 32Z"
				fill="var(--hf-ground)"
			/>
		</svg>
	);
}

function Arrow() {
	return <span aria-hidden="true">↗</span>;
}

export function FireRestaurant({ take, fire, gathering }: { take: FireTake; fire: string; gathering?: string }) {
	return (
		<RestaurantService
			take="ember"
			className={cn("hf", `hf-${take}`)}
			details={{
				name: "Brasa",
				place: "Hökens gata 4, Södermalm",
				dishes: [
					"Warm flatbread, whipped butter, smoked salt",
					"Fire-roasted roots, yoghurt, green herbs",
					"Cast-iron chicken, charred lemon, potatoes",
				],
			}}
		>
			{({ book, menu }) => (
				<>
					{take === "hearth" && (
						<>
							<div className="hf-hearth-photo">
								<img src={fire} alt="Orange flames rising from oak logs and glowing embers in an open hearth" />
							</div>
							<header className="hf-nav">
								<a href="#welcome" className="hf-small-logo">
									<Flame />
									brasa
								</a>
								<span>Food over fire. People around it.</span>
								<button type="button" onClick={book}>
									A spot by the fire <Arrow />
								</button>
							</header>
							<div className="hf-hearth-intro" id="welcome">
								<h1>Come closer.</h1>
								<p>
									There’s bread to tear, something on the fire,
									<br />
									and always room to pull up another chair.
								</p>
							</div>
							<div className="hf-hearth-bottom">
								<span className="hf-big-logo">brasa</span>
								<div>
									<button type="button" onClick={menu}>
										What’s on the fire <Arrow />
									</button>
									<p>
										Hökens gata 4, Stockholm
										<br />
										The fire’s on from 16:00.
									</p>
								</div>
							</div>
						</>
					)}
					{take === "gathering" && (
						<>
							<header className="hf-nav">
								<span>Hökens gata 4, Södermalm</span>
								<Flame />
								<div>
									<button type="button" onClick={menu}>
										Food & drink
									</button>
									<button type="button" onClick={book}>
										Pull up a chair <Arrow />
									</button>
								</div>
							</header>
							<div className="hf-gathering-title">
								<h1>brasa</h1>
								<p>
									Good food.
									<br />
									Warm faces.
									<br />
									One big fire.
								</p>
							</div>
							<div className="hf-gathering-photo">
								<img
									src={gathering ?? fire}
									alt="Friends sharing bread and bowls at a long wooden table beside a glowing restaurant hearth"
								/>
								<button type="button" onClick={book}>
									There’s room
									<br />
									for you.
									<Arrow />
								</button>
							</div>
							<footer className="hf-foot">
								<span>Take your coat off. Stay a while.</span>
								<button type="button" onClick={menu}>
									Tonight at Brasa <Arrow />
								</button>
								<span>Tuesday to Sunday, from 16:00</span>
							</footer>
						</>
					)}
					{take === "kindling" && (
						<>
							<header className="hf-nav">
								<span className="hf-small-logo">
									<Flame />
									brasa
								</span>
								<span>A neighbourhood fireside.</span>
								<div>
									<button type="button" onClick={menu}>
										On the fire
									</button>
									<button type="button" onClick={book}>
										Come over <Arrow />
									</button>
								</div>
							</header>
							<div className="hf-kindling-body">
								<div className="hf-kindling-copy">
									<h1>
										Cold out.
										<br />
										<i>Warm in.</i>
									</h1>
									<p>
										Follow the smell of wood smoke.
										<br />
										We cook over the embers, pass things around,
										<br />
										and put another log on when it gets late.
									</p>
									<button type="button" className="hf-fill" onClick={book}>
										Find a seat <Arrow />
									</button>
									<div className="hf-kindling-hours">
										<Flame />
										<span>
											Lit at 16:00.
											<br />
											Going until the last goodnight.
										</span>
									</div>
								</div>
								<div className="hf-kindling-photo">
									<img src={fire} alt="Bright flames around charred oak logs in a cozy open fire" />
									<span>Built around the fire.</span>
								</div>
							</div>
							<footer className="hf-foot">
								<span>Brasa · Hökens gata 4</span>
								<span>Bring someone. Share something.</span>
							</footer>
						</>
					)}
					{take === "supper" && (
						<>
							<header className="hf-nav">
								<span className="hf-small-logo">
									brasa
									<Flame />
								</span>
								<div>
									<button type="button" onClick={menu}>
										Tonight’s food
									</button>
									<button type="button" onClick={book}>
										Save me a seat <Arrow />
									</button>
								</div>
							</header>
							<div className="hf-supper-body">
								<div className="hf-supper-photo">
									<img src={fire} alt="Cast iron vegetables and bread cooking above flames and glowing coals" />
									<p>
										Off the fire.
										<br />
										Onto the table.
									</p>
								</div>
								<div className="hf-supper-copy">
									<Flame />
									<h1>
										Stay for
										<br />
										<i>another log.</i>
									</h1>
									<p>
										A proper meal. A shared table. That lovely feeling
										<br />
										when nobody’s in a hurry to go home.
									</p>
									<button type="button" className="hf-fill" onClick={book}>
										We’ll keep you a place <Arrow />
									</button>
									<div className="hf-supper-menu">
										<button type="button" onClick={menu}>
											<span>Bread to tear</span>
											<span>01</span>
										</button>
										<button type="button" onClick={menu}>
											<span>Things to share</span>
											<span>02</span>
										</button>
										<button type="button" onClick={menu}>
											<span>One more round</span>
											<span>03</span>
										</button>
									</div>
								</div>
							</div>
							<footer className="hf-foot">
								<span>Hökens gata 4, Stockholm</span>
								<span>The good seats are the warm ones.</span>
							</footer>
						</>
					)}
				</>
			)}
		</RestaurantService>
	);
}
