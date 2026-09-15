import { useEffect, useRef, useState } from "react";
import aluminium from "./assets/aluminium.webp";
import oxblood from "./assets/oxblood.webp";
import "./fold-store.css";
import "./type-studies.css";

type Finish = "aluminium" | "oxblood";
type Palette = "chalk" | "blue" | "plum";
const finishes = {
	aluminium: { name: "Brushed aluminium", image: aluminium },
	oxblood: { name: "Oxblood", image: oxblood },
};
const price = 185;
function Arrow({ back = false }: { back?: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			style={{ transform: back ? "rotate(180deg)" : undefined }}
		>
			<path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.4" />
		</svg>
	);
}
function Mark() {
	return (
		<svg viewBox="0 0 38 40" fill="none" aria-hidden="true">
			<path d="M4 36V4h29L17 19H4m13 0v17" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
		</svg>
	);
}
type Treatment = "original" | "plain" | "condensed" | "soft" | "technical";
export function FoldStore({ palette, treatment = "original" }: { palette: Palette; treatment?: Treatment }) {
	const [choosing, setChoosing] = useState(false);
	const [finish, setFinish] = useState<Finish>("aluminium");
	const [light, setLight] = useState(false);
	const [detail, setDetail] = useState(false);
	const [bag, setBag] = useState<Record<Finish, number>>({ aluminium: 0, oxblood: 0 });
	const [bagOpen, setBagOpen] = useState(false);
	const dialog = useRef<HTMLDialogElement>(null);
	const closeBagButton = useRef<HTMLButtonElement>(null);
	const chooseButton = useRef<HTMLButtonElement>(null);
	const finishButton = useRef<HTMLButtonElement>(null);
	const count = bag.aluminium + bag.oxblood;
	useEffect(() => {
		const node = dialog.current;
		if (!node) return;
		if (bagOpen && !node.open) {
			node.showModal();
			closeBagButton.current?.focus();
		}
		if (!bagOpen && node.open) node.close();
	}, [bagOpen]);
	function closeBag() {
		const node = dialog.current;
		if (!node) return;
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setBagOpen(false);
			return;
		}
		const current = getComputedStyle(node);
		const from = { transform: current.transform, opacity: current.opacity };
		node.getAnimations().forEach((a) => a.cancel());
		const exit = node.animate([from, { transform: "translateX(32px)", opacity: 0 }], {
			duration: 150,
			easing: "cubic-bezier(.2,.8,.2,1)",
			fill: "forwards",
		});
		exit.finished
			.then(() => {
				// Close while the exit still holds its transparent final frame.
				node.close();
				exit.cancel();
				setBagOpen(false);
			})
			.catch(() => {});
	}
	function choose(next: boolean) {
		setChoosing(next);
		setDetail(false);
		requestAnimationFrame(() => (next ? finishButton : chooseButton).current?.focus({ preventScroll: true }));
	}
	function addToBag() {
		setBag((current) => ({ ...current, [finish]: Math.min(5, current[finish] + 1) }));
		setBagOpen(true);
	}
	return (
		<div
			className={`fold-store fold-${palette} fold-type-${treatment} ${treatment === "original" ? "" : "fold-refined"}`}
			data-choosing={choosing}
			data-light={light}
			data-detail={detail}
		>
			<div className="fold-night" aria-hidden="true" />
			<header className="fold-header">
				<button className="fold-brand" aria-label="Fold Objects home" onClick={() => choose(false)}>
					<Mark />
					<span>
						Fold
						<br />
						Objects
					</span>
				</button>
				<nav aria-label="Shop">
					<button onClick={() => choose(true)}>The light</button>
					<button
						onClick={() => {
							setChoosing(false);
							setDetail(true);
						}}
					>
						How it’s made
					</button>
				</nav>
				<button className="fold-bag-trigger" onClick={() => setBagOpen(true)}>
					Bag <span aria-live="polite">{count.toString().padStart(2, "0")}</span>
				</button>
			</header>
			<main className="fold-main">
				<div className="fold-campaign" inert={choosing || detail}>
					<p className="fold-intro">
						One sheet of aluminium.
						<br />A light you can take anywhere.
					</p>
					<h1>
						Fold 01<span>.</span>
					</h1>
					<div className="fold-launch">
						<p>
							A portable table light.
							<br />
							Designed to move from room to room.
						</p>
						<button ref={chooseButton} className="fold-primary" onClick={() => choose(true)}>
							Choose yours{" "}
							<span>
								€185 <Arrow />
							</span>
						</button>
					</div>
				</div>
				<div className="fold-object-wrap">
					<div className="fold-object">
						<div className="fold-pool" style={{ opacity: light ? 0.65 : 0 }} aria-hidden="true" />
						<img
							src={aluminium}
							alt={finish === "aluminium" ? "Fold 01 portable lamp in brushed aluminium" : ""}
							className="fold-photo"
							style={{ opacity: finish === "aluminium" ? 1 : 0 }}
							draggable={false}
						/>
						<img
							src={oxblood}
							alt={finish === "oxblood" ? "Fold 01 portable lamp in oxblood" : ""}
							className="fold-photo"
							style={{ opacity: finish === "oxblood" ? 1 : 0 }}
							draggable={false}
						/>
						<svg
							className="fold-diffuser"
							viewBox="0 0 1254 1254"
							aria-hidden="true"
							style={{ opacity: light ? 0.85 : 0 }}
						>
							<path d="M443 231 874 166Q897 161 920 166L1044 207 569 266Z" fill="#ffe3a4" />
						</svg>
					</div>
				</div>
				<div className="fold-inspect" data-show={detail} aria-hidden={!detail} inert={!detail}>
					<h2>One continuous fold.</h2>
					<p>A brushed aluminium body curves into the base and head. The diffuser sits flush underneath.</p>
					<button onClick={() => setDetail(false)}>
						See the whole light <Arrow back />
					</button>
				</div>
				<div className="fold-product" inert={!choosing}>
					<button className="fold-back" onClick={() => choose(false)}>
						<Arrow back /> Back to the light
					</button>
					<h2>Fold 01.</h2>
					<p>Portable table light</p>
					<fieldset>
						<legend>
							Finish <span>{finishes[finish].name}</span>
						</legend>
						<div className="fold-finishes">
							{(["aluminium", "oxblood"] as const).map((f) => (
								<button
									key={f}
									ref={f === "aluminium" ? finishButton : undefined}
									className={`fold-finish fold-finish-${f}`}
									aria-label={finishes[f].name}
									aria-pressed={finish === f}
									onClick={() => setFinish(f)}
								>
									<span className="fold-finish-swatch" />
									{treatment !== "original" && <span className="fold-finish-name">{finishes[f].name}</span>}
									<svg viewBox="0 0 20 20" aria-hidden="true">
										<path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="1.5" />
									</svg>
								</button>
							))}
						</div>
					</fieldset>
					<dl>
						<div>
							<dt>Height</dt>
							<dd>28 cm</dd>
						</div>
						<div>
							<dt>Light</dt>
							<dd>Warm white, dimmable</dd>
						</div>
						<div>
							<dt>Power</dt>
							<dd>USB-C rechargeable</dd>
						</div>
					</dl>
					<button className="fold-primary fold-add" onClick={addToBag}>
						Add to bag{" "}
						<span>
							€185 <Arrow />
						</span>
					</button>
					<p className="fold-shipping">Free shipping. A two-year warranty.</p>
				</div>
				<div className="fold-tools">
					<button aria-pressed={light} onClick={() => setLight((v) => !v)} className="fold-switch">
						<span>
							<i />
						</span>
						{light ? "Light on" : "Switch it on"}
					</button>
					<button
						className="fold-inspect-trigger"
						aria-pressed={detail}
						onClick={() => {
							if (choosing) setChoosing(false);
							setDetail((v) => !v);
						}}
					>
						{detail ? "Zoom out" : "A closer look"}
						<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
							<path d={detail ? "M4 10h12" : "M4 10h12M10 4v12"} stroke="currentColor" strokeWidth="1.2" />
						</svg>
					</button>
				</div>
			</main>
			<footer className="fold-footer">
				<span>28 cm · USB-C rechargeable</span>
				<span>Available in two finishes.</span>
				<span>Fold Objects © 2026</span>
			</footer>
			<dialog
				ref={dialog}
				className="fold-bag"
				onCancel={(e) => {
					e.preventDefault();
					closeBag();
				}}
				onClick={(e) => {
					if (e.target === e.currentTarget) {
						const r = e.currentTarget.getBoundingClientRect();
						if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
							closeBag();
					}
				}}
				aria-labelledby="fold-bag-title"
			>
				<div className="fold-bag-heading">
					<h2 id="fold-bag-title">
						Your bag <span>({count})</span>
					</h2>
					<button ref={closeBagButton} onClick={closeBag} aria-label="Close bag">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.5" />
						</svg>
					</button>
				</div>
				{count === 0 ? (
					<div className="fold-empty">
						<Mark />
						<h3>Your bag is empty.</h3>
						<button
							className="fold-primary"
							onClick={() => {
								closeBag();
								choose(true);
							}}
						>
							Find your finish <Arrow />
						</button>
					</div>
				) : (
					<>
						<div className="fold-bag-items">
							{(["aluminium", "oxblood"] as const)
								.filter((f) => bag[f] > 0)
								.map((f) => (
									<article className="fold-bag-item" key={f}>
										<img src={finishes[f].image} alt={`Fold 01, ${finishes[f].name}`} />
										<div>
											<h3>Fold 01</h3>
											<p>{finishes[f].name}</p>
											<div className="fold-quantity">
												<button
													aria-label={`Remove one ${finishes[f].name}`}
													onClick={() => setBag((b) => ({ ...b, [f]: Math.max(0, b[f] - 1) }))}
												>
													−
												</button>
												<output aria-live="polite">{bag[f]}</output>
												<button
													aria-label={`Add one ${finishes[f].name}`}
													disabled={bag[f] >= 5}
													onClick={() => setBag((b) => ({ ...b, [f]: Math.min(5, b[f] + 1) }))}
												>
													+
												</button>
											</div>
										</div>
										<span>€{bag[f] * price}</span>
									</article>
								))}
						</div>
						<div className="fold-bag-bottom">
							<p>
								<span>Subtotal</span>
								<strong>€{count * price}</strong>
							</p>
							<p>Shipping included.</p>
							<button className="fold-primary" onClick={closeBag}>
								Keep browsing <Arrow />
							</button>
							<small>This is a fictional shop. Your bag is saved for this visit.</small>
						</div>
					</>
				)}
			</dialog>
		</div>
	);
}
