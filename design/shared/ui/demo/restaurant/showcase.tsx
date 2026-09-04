import { useRef, useState, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import "./showcase.css";

export type Take = "ember" | "paper" | "olive" | "vermilion" | "sera" | "marea" | "orto" | "maison" | "sumi" | "late";

const restaurants: Record<Take, { name: string; place: string; dishes: readonly string[] }> = {
	ember: {
		name: "Brasa",
		place: "Hökens gata 4, Stockholm",
		dishes: [
			"Scallop, brown butter, green apple",
			"Celeriac, hazelnut, winter truffle",
			"Duck, burnt plum, black garlic",
		],
	},
	paper: {
		name: "Brasa",
		place: "Hökens gata 4, Stockholm",
		dishes: ["Leeks, smoked cream, trout roe", "Turbot, mussels, young fennel", "Pear, toasted cream, thyme"],
	},
	olive: {
		name: "Brasa",
		place: "Hökens gata 4, Stockholm",
		dishes: ["Tomatoes, lovage, fresh cheese", "Cod, new potatoes, dill", "Strawberries, milk ice cream"],
	},
	vermilion: {
		name: "Brasa",
		place: "Hökens gata 4, Stockholm",
		dishes: ["Crab toast, lemon, chilli", "Beef, grilled onions, pepper sauce", "Chocolate, olive oil, sea salt"],
	},
	sera: {
		name: "Sera",
		place: "Skånegatan 82, Stockholm",
		dishes: ["Burrata, peaches, basil", "Ravioli, sage, brown butter", "Panna cotta, late raspberries"],
	},
	marea: {
		name: "Marea",
		place: "Strandvägen 18, Stockholm",
		dishes: ["Oysters, cucumber, sea herbs", "Sea bass, lemon, saffron", "Almond cake, citrus, cream"],
	},
	orto: {
		name: "Orto",
		place: "Nytorgsgatan 12, Stockholm",
		dishes: ["Fried courgette flowers", "Rigatoni, slow tomatoes, basil", "Pistachio gelato, olive oil"],
	},
	maison: {
		name: "Maison",
		place: "Roslagsgatan 6, Stockholm",
		dishes: ["Onion soup, Gruyère toast", "Steak frites, béarnaise", "Crème caramel"],
	},
	sumi: {
		name: "Sumi",
		place: "Tegnérgatan 9, Stockholm",
		dishes: ["Aubergine, sesame, white miso", "Charcoal chicken, spring onion", "Black sesame, rice, cherry"],
	},
	late: {
		name: "Bar Lune",
		place: "Tjärhovsgatan 3, Stockholm",
		dishes: ["Anchovies, cultured butter, toast", "Potato rösti, crème fraîche, roe", "Basque cheesecake"],
	},
};

function Arrow() {
	return <span aria-hidden="true">↗</span>;
}

export function RestaurantService({
	take,
	children,
	initial = "home",
	className,
	details,
}: {
	take: Take;
	children: (actions: { book: () => void; menu: () => void }) => ReactNode;
	initial?: "home" | "booking";
	className?: string;
	details?: { name: string; place: string; dishes: readonly string[] };
}) {
	const restaurant = details ?? restaurants[take];
	const dialog = useRef<HTMLDialogElement>(null);
	const [panel, setPanel] = useState<"menu" | "booking">("booking");
	const [time, setTime] = useState("19:00");
	const [guests, setGuests] = useState("2");
	const [date, setDate] = useState("2026-09-18");
	const [confirmed, setConfirmed] = useState(false);
	const open = (next: "menu" | "booking") => {
		setPanel(next);
		setConfirmed(false);
		dialog.current?.showModal();
	};
	const booking = (
		<>
			{confirmed ? (
				<div className="rs-confirm" role="status">
					<span className="rs-confirm-mark">✓</span>
					<h2>See you at {time}.</h2>
					<p>
						A table for {guests} on{" "}
						{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
					</p>
					<p>{restaurant.place}</p>
					<small>This is a prototype reservation.</small>
					<button type="button" className="rs-solid" onClick={() => setConfirmed(false)}>
						Make another reservation <Arrow />
					</button>
				</div>
			) : (
				<form
					onKeyDown={(event) => {
						if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
							event.preventDefault();
							if (event.currentTarget.reportValidity()) setConfirmed(true);
						}
					}}
					onSubmit={(event) => {
						event.preventDefault();
						setConfirmed(true);
					}}
				>
					<h2>A table for you.</h2>
					<p>Come hungry. Stay a little longer.</p>
					<div className="rs-fields">
						<label>
							Your evening
							<input
								type="date"
								value={date}
								min="2026-09-04"
								required
								onChange={(event) => setDate(event.target.value)}
							/>
						</label>
						<label>
							At the table
							<select value={guests} onChange={(event) => setGuests(event.target.value)}>
								{[1, 2, 3, 4, 5, 6].map((count) => (
									<option key={count} value={count}>
										{count} {count === 1 ? "guest" : "guests"}
									</option>
								))}
							</select>
						</label>
					</div>
					<fieldset>
						<legend>Choose a time</legend>
						<div className="rs-times">
							{["17:30", "18:00", "19:00", "19:30", "20:30"].map((slot) => (
								<button key={slot} type="button" aria-pressed={time === slot} onClick={() => setTime(slot)}>
									{slot}
								</button>
							))}
						</div>
					</fieldset>
					<label>
						Your name
						<input autoComplete="name" name="name" required placeholder="Alex Andersson" />
					</label>
					<label>
						Email address
						<input type="email" autoComplete="email" name="email" required placeholder="alex@example.com" />
					</label>
					<button
						className="rs-solid"
						type="button"
						onClick={(event) => {
							if (event.currentTarget.form?.reportValidity()) setConfirmed(true);
						}}
					>
						Reserve for {guests} at {time} <Arrow />
					</button>
					<small>Prototype only. No reservation or email is sent.</small>
				</form>
			)}
		</>
	);
	return (
		<main className={cn("rs", `rs-${take}`, className)}>
			{initial === "booking" ? (
				<div className="rs-booking-page">
					<div className="rs-booking-intro">
						<span className="rs-wordmark">{restaurant.name}</span>
						<h1>
							Make an
							<br />
							<i>evening</i>
							<br />
							of it.
						</h1>
						<p>
							{restaurant.place}
							<br />
							Tuesday to Saturday, 17:00 until late.
						</p>
					</div>
					<div className="rs-booking-body">{booking}</div>
				</div>
			) : (
				children({ book: () => open("booking"), menu: () => open("menu") })
			)}
			<dialog
				ref={dialog}
				aria-label={`${restaurant.name} ${panel === "menu" ? "menu" : "reservation"}`}
				className="rs-dialog"
				onClick={(event) => {
					if (event.target === dialog.current) dialog.current?.close();
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") dialog.current?.close();
				}}
			>
				<div className="rs-dialog-inner">
					<header>
						<span>{restaurant.name}</span>
						<button type="button" aria-label="Close" onClick={() => dialog.current?.close()}>
							Close ×
						</button>
					</header>
					{panel === "booking" ? (
						booking
					) : (
						<div className="rs-menu">
							<h2>On the table.</h2>
							<p>A little of what we’re cooking this September.</p>
							{restaurant.dishes.map((dish, index) => (
								<div key={dish}>
									<span>0{index + 1}</span>
									<h3>{dish}</h3>
								</div>
							))}
							<p>
								Three courses, 695 kr per person.
								<br />
								Tell us about any allergies when you arrive.
							</p>
							<button type="button" className="rs-solid" onClick={() => setPanel("booking")}>
								Find a table <Arrow />
							</button>
						</div>
					)}
				</div>
			</dialog>
		</main>
	);
}

function Nav({
	name,
	book,
	menu,
	location = "Stockholm",
}: {
	name: string;
	book: () => void;
	menu: () => void;
	location?: string;
}) {
	return (
		<nav className="rs-nav" aria-label="Restaurant">
			<span className="rs-wordmark">{name}</span>
			<span className="rs-nav-place">{location}</span>
			<div>
				<button type="button" onClick={menu}>
					The menu
				</button>
				<button className="rs-nav-book" type="button" onClick={book}>
					Book a table <Arrow />
				</button>
			</div>
		</nav>
	);
}

function Footer({ left, right }: { left: string; right?: string }) {
	return (
		<footer className="rs-footer">
			<span>{left}</span>
			<span>{right ?? "Tuesday to Saturday · 17:00 until late"}</span>
		</footer>
	);
}

export function RestaurantShowcase({
	take,
	photo,
	detail,
	initial = "home",
}: {
	take: Take;
	photo: string;
	detail?: string;
	initial?: "home" | "booking";
}) {
	return (
		<RestaurantService take={take} initial={initial}>
			{({ book, menu }) => {
				switch (take) {
					case "ember":
						return (
							<>
								<div className="rs-ember-photo">
									<img src={photo} alt="A warmly lit dining room, set for the evening" />
								</div>
								<Nav name="Brasa" book={book} menu={menu} />
								<div className="rs-ember-copy">
									<p>
										A small room.
										<br />
										An open fire.
										<br />A very long evening.
									</p>
									<button type="button" className="rs-round" onClick={book}>
										Come on in <Arrow />
									</button>
								</div>
								<h1 className="rs-ember-title">
									brasa<span>®</span>
								</h1>
								<Footer left="Hökens gata 4, Södermalm" right="24 seats. Yours is waiting." />
							</>
						);
					case "paper":
						return (
							<>
								<Nav name="BRASA" book={book} menu={menu} />
								<div className="rs-paper-heading">
									<h1>
										Good things
										<br />
										take <i>fire.</i>
									</h1>
									<p>
										A neighbourhood restaurant
										<br />
										with nothing to rush.
										<br />
										<button type="button" onClick={menu}>
											See what’s cooking <Arrow />
										</button>
									</p>
								</div>
								<div className="rs-paper-image">
									<img src={photo} alt="White linen, wine glasses and the first course" />
									<span className="rs-paper-seal">
										A seat
										<br />
										at our
										<br />
										<i>table.</i>
									</span>
								</div>
								<Footer left="Come as you are. Leave well fed." right="Hökens gata 4 · Stockholm" />
							</>
						);
					case "olive":
						return (
							<>
								<Nav name="Brasa" book={book} menu={menu} location="59°19′ N 18°04′ E" />
								<div className="rs-olive-heading">
									<h1>
										A little closer
										<br />
										to <i>the good things.</i>
									</h1>
									<p>
										Seasonal cooking. A glass of something lovely.
										<br />
										Your favourite people around one table.
									</p>
								</div>
								<div className="rs-olive-scene">
									<img src={photo} alt="A garden restaurant with sunlight falling across the tables" />
									<button type="button" onClick={book}>
										Stay for dinner <Arrow />
									</button>
								</div>
								<span className="rs-olive-name" aria-hidden="true">
									brasa
								</span>
								<Footer left="Rooted in the season, here in Södermalm." right="Dinner from 17:00" />
							</>
						);
					case "vermilion":
						return (
							<>
								<div className="rs-vermilion-left">
									<Nav name="BRASA" book={book} menu={menu} />
									<h1>
										FIRE.
										<br />
										FOOD.
										<br />
										<i>FRIENDS.</i>
									</h1>
									<div className="rs-vermilion-bottom">
										<p>
											Some evenings
											<br />
											deserve the whole evening.
										</p>
										<button className="rs-round" type="button" onClick={book}>
											Grab a table <Arrow />
										</button>
									</div>
								</div>
								<div className="rs-vermilion-right">
									<img src={photo} alt="An intimate restaurant table set with glassware" />
									<span>Stockholm, with love.</span>
								</div>
							</>
						);
					case "sera":
						return (
							<>
								<Nav name="sera" book={book} menu={menu} location="Vino, pasta, compagnia" />
								<h1 className="rs-sera-title">
									The night
									<br />
									is <i>still young.</i>
								</h1>
								<div className="rs-sera-photo rs-sera-photo-one">
									<img src={photo} alt="Fresh pasta with herbs and tomato" />
								</div>
								<div className="rs-sera-photo rs-sera-photo-two">
									<img src={detail ?? photo} alt="Red wine poured for dinner" />
								</div>
								<div className="rs-sera-note">
									<p>
										One more glass.
										<br />A little more pasta.
										<br />
										You know how it goes.
									</p>
									<button type="button" onClick={book}>
										Spend the evening <Arrow />
									</button>
								</div>
								<Footer left="Skånegatan 82 · Stockholm" right="Kitchen until 23:00. Company until late." />
							</>
						);
					case "marea":
						return (
							<>
								<Nav name="marea" book={book} menu={menu} location="By the water, in Stockholm" />
								<div className="rs-marea-body">
									<div>
										<h1>
											Follow
											<br />
											the <i>tide.</i>
										</h1>
										<p>
											Long lunches, cold wine,
											<br />
											and whatever the sea brings in.
										</p>
										<button type="button" onClick={book}>
											Find your place <Arrow />
										</button>
									</div>
									<div className="rs-marea-image">
										<img src={photo} alt="Sunlit outdoor dining beneath green trees" />
										<span>Lunch becomes dinner.</span>
									</div>
								</div>
								<div className="rs-waves" aria-hidden="true">
									∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿ ∿
								</div>
								<Footer left="Strandvägen 18" right="Lunch from 12. Dinner until late." />
							</>
						);
					case "orto":
						return (
							<>
								<Nav name="orto" book={book} menu={menu} location="Pasta, naturally." />
								<h1 className="rs-orto-title">
									PASTA.
									<br />
									<span>BASTA.</span>
								</h1>
								<div className="rs-orto-dish">
									<img src={photo} alt="A generous plate of handmade pasta" />
								</div>
								<div className="rs-orto-note">
									<span aria-hidden="true">✳</span>
									<p>
										A little flour.
										<br />A lot of feeling.
									</p>
									<button type="button" onClick={menu}>
										What’s for dinner? <Arrow />
									</button>
								</div>
								<Footer left="Made by hand. Eaten with friends." right="Nytorgsgatan 12 · Stockholm" />
							</>
						);
					case "maison":
						return (
							<>
								<Nav name="MAISON" book={book} menu={menu} location="Le bistrot du quartier" />
								<div className="rs-maison-body">
									<div className="rs-maison-photo">
										<img src={photo} alt="A candlelit table ready for a long bistro dinner" />
									</div>
									<div className="rs-maison-menu">
										<span className="rs-maison-star" aria-hidden="true">
											✳
										</span>
										<h1>
											Bonjour,
											<br />
											<i>bonsoir.</i>
										</h1>
										<p>
											A table near the window.
											<br />
											The wine you always order.
											<br />
											Something that tastes like home.
										</p>
										<div className="rs-maison-rule" />
										<button type="button" onClick={menu}>
											À la carte <Arrow />
										</button>
										<button type="button" onClick={book}>
											Votre table <Arrow />
										</button>
										<small>Roslagsgatan 6, Stockholm</small>
									</div>
								</div>
								<Footer left="Un peu de Paris. A lot of Stockholm." right="Open Tuesday to Sunday" />
							</>
						);
					case "sumi":
						return (
							<>
								<Nav name="sumi" book={book} menu={menu} location="Charcoal kitchen · Stockholm" />
								<div className="rs-sumi-body">
									<h1>
										Fire.
										<br />
										Time.
										<br />
										<i>
											Nothing
											<br />
											extra.
										</i>
									</h1>
									<div className="rs-sumi-image">
										<img src={photo} alt="A carefully plated seasonal course" />
									</div>
									<div className="rs-sumi-side">
										<span aria-hidden="true">炭</span>
										<p>
											Twelve seats.
											<br />
											One counter.
											<br />A kitchen in plain sight.
										</p>
										<button type="button" onClick={book}>
											Take a seat <Arrow />
										</button>
									</div>
								</div>
								<Footer left="Tegnérgatan 9" right="Two sittings · 18:00 & 20:30" />
							</>
						);
					case "late":
						return (
							<>
								<Nav name="BAR LUNE" book={book} menu={menu} location="Good evenings, bad timekeeping." />
								<div className="rs-late-body">
									<div className="rs-late-image">
										<img src={photo} alt="Wine glowing ruby red in a glass" />
									</div>
									<h1>
										Just
										<br />
										<i>one</i>
										<br />
										more.
									</h1>
									<button type="button" className="rs-late-book" onClick={book}>
										Meet you
										<br />
										at the bar. <Arrow />
									</button>
									<p className="rs-late-note">
										Small plates. Big nights.
										<br />
										Something good on the speakers.
									</p>
								</div>
								<Footer left="Tjärhovsgatan 3 · Södermalm" right="17:00 until we say goodnight" />
							</>
						);
				}
			}}
		</RestaurantService>
	);
}
