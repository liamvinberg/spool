/**
 * The three empty-cart takes, as three sub-agents really built them.
 *
 * These are not three invented empty states. They are renditions of the frames
 * in the capture behind agent-play--subagents — cart--empty, cart--empty-b and
 * cart--empty-c, written in parallel by three designers working from the same
 * brief and three different angles, and read back off the PNGs spool shot of
 * them. Copy, palette, structure and mass are theirs.
 *
 * Authored at the 240x520 natural size the coffee screens use, so the field can
 * scale every frame on the canvas by one factor and stay honest about zoom.
 * Everything is the real 390x844 value times 0.615, which is what carries a
 * 390pt design into this box; nothing is re-composed to fit.
 *
 * Three answers, not one restyled — which is the whole point of running three
 * agents rather than asking one for three:
 *   restrained  house continuity. One rule, one ring, one line, one action. The
 *               craft is in the emptiness it refuses to fill.
 *   re-order    the empty state that does work. The guest's usual in black at
 *               the top, quick-add rows, past orders, a stamp card. Dense.
 *   expressive  a poster. Espresso ground, cream serif, a cup seen from above
 *               drawn in nothing but circles.
 *
 * The expressive take drifts and its glow breathes in the real frame. At canvas
 * zoom that is a pixel and a half over thirteen seconds, so it is left out here
 * rather than competing with the frames arriving around it.
 */

const SANS = "font-[Instrument_Sans]";

/* ---------- restrained ---------- */

export function CartEmptyRestrained() {
	return (
		<div
			className={`flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-white p-3 ${SANS} text-[#17171A]`}
		>
			<h1 className="font-semibold text-[11px] leading-[14px]">Din varukorg</h1>
			<div className="flex min-h-0 flex-1 flex-col justify-center pb-[30px]">
				<div className="relative flex h-[30px] items-center justify-center">
					<span className="-translate-y-1/2 absolute inset-x-0 top-1/2 h-px bg-neutral-200" />
					<span className="relative bg-white px-[3px]">
						<span className="block h-[30px] w-[30px] rounded-full border border-neutral-300" />
					</span>
				</div>
				<h2 className="mt-[20px] text-center font-semibold text-[12px] tracking-tight leading-[15px]">
					Varukorgen är tom
				</h2>
				<p className="mx-auto mt-[6px] max-w-[152px] text-balance text-center text-[8.5px] text-neutral-500 leading-[13px]">
					Dagens cortado kostar 42 kr och väntar på Torsgatan 11.
				</p>
			</div>
			<div className="flex h-[26px] shrink-0 items-center justify-center rounded-[3px] bg-black text-[8.5px] text-white leading-3">
				Till menyn
			</div>
		</div>
	);
}

/* ---------- re-order ---------- */

const QUICK = [
	{ name: "Cortado", note: "Dubbel espresso, lite mjölk", kr: "42 kr", count: 2 },
	{ name: "Flat white", note: "Espresso, silkig mjölk", kr: "48 kr", count: 0 },
	{ name: "Filterkaffe", note: "Ljusrostad Kirinyaga, Kenya", kr: "32 kr", count: 0 },
] as const;

const AGAIN = [
	{ name: "Tisdag 21 juli", note: "Flat white stor och filterkaffe", kr: "86 kr" },
	{ name: "Fredag 17 juli", note: "Cortado, 2 st", kr: "84 kr" },
] as const;

function Heading({ children }: { children: string }) {
	return <h2 className="px-3 pt-[12px] pb-[5px] font-medium text-[7.5px] text-neutral-500 leading-[10px]">{children}</h2>;
}

function ListRow({
	name,
	note,
	kr,
	count,
	icon,
}: {
	name: string;
	note: string;
	kr: string;
	count: number;
	icon: "plus" | "repeat";
}) {
	return (
		<div className="flex items-center gap-[7px] border-neutral-200 border-t px-3 py-[9px]">
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium text-[9.5px] leading-[12px]">{name}</span>
				<span className="mt-[1px] block truncate text-[7.5px] text-neutral-500 leading-[10px]">{note}</span>
			</span>
			<span className="w-[24px] shrink-0 text-right text-[9.5px] text-neutral-500 tabular-nums leading-[12px]">{kr}</span>
			<span
				className={`flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full ${
					count > 0 ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-900"
				}`}
			>
				{count > 0 ? (
					<span className="font-semibold text-[8px] tabular-nums leading-none">{count}</span>
				) : icon === "plus" ? (
					<PlusGlyph />
				) : (
					<RepeatGlyph />
				)}
			</span>
		</div>
	);
}

function PlusGlyph() {
	return (
		<svg viewBox="0 0 24 24" className="h-[10px] w-[10px]" fill="none" aria-hidden="true">
			<path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function RepeatGlyph() {
	return (
		<svg viewBox="0 0 24 24" className="h-[10px] w-[10px]" fill="none" aria-hidden="true">
			<path
				d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CartEmptyReorder() {
	return (
		<div
			className={`flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-white ${SANS} text-neutral-900`}
		>
			<header className="px-3 pt-[15px] pb-[10px]">
				<div className="flex items-baseline justify-between">
					<h1 className="font-semibold text-[13.5px] tracking-tight leading-[17px]">Varukorg</h1>
					<span className="text-[7.5px] text-neutral-500 leading-[10px]">Torsgatan 11</span>
				</div>
				<p className="mt-[4px] text-[7.5px] text-neutral-500 leading-[10px]">Tom just nu. Senast beställt tisdag 21 juli.</p>
			</header>

			<Heading>Ditt vanliga</Heading>
			<div className="flex items-center gap-[7px] bg-neutral-950 px-3 py-[10px]">
				<span className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-[10.5px] text-white leading-[15px]">Flat white</span>
					<span className="mt-[1px] block truncate text-[7.5px] text-white/60 leading-[10px]">Stor, havremjölk</span>
					<span className="mt-[1px] block truncate text-[7px] text-white/40 leading-[10px]">
						Beställd 12 gånger sedan i mars
					</span>
				</span>
				<span className="w-[26px] shrink-0 text-right font-semibold text-[9.5px] text-white tabular-nums leading-[12px]">
					54 kr
				</span>
				<span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-white">
					<span className="font-semibold text-[8px] text-neutral-950 tabular-nums leading-none">1</span>
				</span>
			</div>

			<Heading>Snabbval</Heading>
			{QUICK.map((drink) => (
				<ListRow key={drink.name} name={drink.name} note={drink.note} kr={drink.kr} count={drink.count} icon="plus" />
			))}

			<Heading>Beställ igen</Heading>
			<div className="border-neutral-200 border-b">
				{AGAIN.map((order) => (
					<ListRow key={order.name} name={order.name} note={order.note} kr={order.kr} count={0} icon="repeat" />
				))}
			</div>

			<div className="px-3 pt-[12px]">
				<div className="flex items-baseline justify-between gap-2">
					<span className="font-medium text-[9.5px] leading-[12px]">Stämpelkort</span>
					<span className="text-[7.5px] text-neutral-500 leading-[10px]">Tre kvar till en på huset</span>
				</div>
				<div className="mt-[7px] flex gap-[2px]">
					{Array.from({ length: 10 }, (_, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: ten identical stamps have no other identity
							key={index}
							className={`h-[2px] flex-1 rounded-full ${index < 7 ? "bg-neutral-900" : "bg-neutral-200"}`}
						/>
					))}
				</div>
			</div>

			<div className="min-h-[6px] flex-1" />
			<footer className="border-neutral-200 border-t px-3 pt-[10px] pb-[20px]">
				<div className="flex items-baseline justify-between">
					<span className="text-[7.5px] text-neutral-500 leading-[10px]">3 varor i varukorgen</span>
					<span className="font-semibold text-[7.5px] tabular-nums leading-[10px]">138 kr</span>
				</div>
				<div className="mt-[7px] flex h-[32px] items-center justify-center gap-[5px] rounded-[7px] border border-neutral-900 font-medium text-[9.5px] leading-[12px]">
					Visa hela menyn
					<svg viewBox="0 0 24 24" className="h-[10px] w-[10px]" fill="none" aria-hidden="true">
						<path
							d="M5 12h14M13 6l6 6-6 6"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</footer>
		</div>
	);
}

/* ---------- expressive ---------- */

const PRICES = [
	{ name: "Cortado", kr: "42 kr", align: "text-left" },
	{ name: "Flat white", kr: "48 kr", align: "text-center" },
	{ name: "Filterkaffe", kr: "32 kr", align: "text-right" },
] as const;

export function CartEmptyExpressive() {
	return (
		<div
			className="relative flex h-full w-full flex-col overflow-hidden rounded-lg"
			style={{ background: "linear-gradient(178deg, #221812 0%, #17100D 44%, #120C0A 100%)" }}
		>
			<header className="flex shrink-0 items-baseline justify-between px-[17px] pt-[19px]">
				<span className="font-serif text-[12.5px] text-[#F2E7D6] leading-none">kaffe</span>
				<span className="font-[Menlo] text-[5.5px] text-[#9C9287] uppercase leading-none tracking-[0.2em]">
					Torsgatan 11
				</span>
			</header>

			{/* a cup from directly above: saucer, rim, empty bottom, one light from the left */}
			<svg viewBox="0 0 390 362" className="h-[223px] w-full shrink-0" aria-hidden="true">
				<defs>
					<linearGradient id="ke-rim" gradientUnits="userSpaceOnUse" x1="84" y1="69" x2="306" y2="291">
						<stop offset="0" stopColor="#F2E7D6" stopOpacity="0.9" />
						<stop offset="0.45" stopColor="#F2E7D6" stopOpacity="0.44" />
						<stop offset="1" stopColor="#F2E7D6" stopOpacity="0.22" />
					</linearGradient>
					<linearGradient id="ke-hair" gradientUnits="userSpaceOnUse" x1="25" y1="10" x2="365" y2="350">
						<stop offset="0" stopColor="#F2E7D6" stopOpacity="0.3" />
						<stop offset="0.5" stopColor="#F2E7D6" stopOpacity="0.14" />
						<stop offset="1" stopColor="#F2E7D6" stopOpacity="0.07" />
					</linearGradient>
					<linearGradient id="ke-pool" gradientUnits="userSpaceOnUse" x1="283" y1="204" x2="120" y2="232">
						<stop offset="0" stopColor="#F2E7D6" stopOpacity="0" />
						<stop offset="0.3" stopColor="#F2E7D6" stopOpacity="0.15" />
						<stop offset="0.75" stopColor="#F2E7D6" stopOpacity="0.05" />
						<stop offset="1" stopColor="#F2E7D6" stopOpacity="0" />
					</linearGradient>
					<radialGradient id="ke-glow">
						<stop offset="0" stopColor="#E0A362" stopOpacity="0.16" />
						<stop offset="0.6" stopColor="#E0A362" stopOpacity="0.05" />
						<stop offset="1" stopColor="#E0A362" stopOpacity="0" />
					</radialGradient>
				</defs>
				<circle cx="195" cy="180" r="170" fill="none" stroke="url(#ke-hair)" strokeWidth="1" />
				<circle cx="195" cy="180" r="146" fill="none" stroke="url(#ke-hair)" strokeWidth="0.75" opacity="0.5" />
				<circle cx="195" cy="180" r="97" fill="#000000" fillOpacity="0.2" />
				<path d="M 282.9 203.6 A 91 91 0 0 1 120.5 232.2" fill="none" stroke="url(#ke-pool)" strokeWidth="8" strokeLinecap="round" />
				<circle cx="195" cy="180" r="70" fill="url(#ke-glow)" />
				<path d="M 287 118 C 347 129, 347 231, 287 242" fill="none" stroke="url(#ke-rim)" strokeWidth="1.5" strokeLinecap="round" />
				<path d="M 300 142 C 324 152, 324 208, 300 218" fill="none" stroke="url(#ke-rim)" strokeWidth="1.1" strokeLinecap="round" />
				<circle cx="195" cy="180" r="111" fill="none" stroke="url(#ke-rim)" strokeWidth="2" />
				<circle cx="195" cy="180" r="97" fill="none" stroke="url(#ke-rim)" strokeWidth="1" />
				<circle cx="195" cy="180" r="57" fill="none" stroke="url(#ke-hair)" strokeWidth="0.75" />
			</svg>

			<div className="mt-auto shrink-0 px-[17px]">
				<h1 className="font-serif text-[28px] text-[#F2E7D6] tracking-[-0.02em] leading-[0.94]">
					Tom kopp.
					<br />
					<span className="text-[#E0A362] italic">Så länge.</span>
				</h1>
				<p className="mt-[10px] max-w-[178px] text-[8.5px] text-[#B7ADA0] leading-[1.55]">
					Sanna gissar på en cortado, som i tisdags. Men du bestämmer, kvarnen är redan igång.
				</p>
			</div>

			<div className="shrink-0 px-[17px] pt-[22px] pb-[24px]">
				<div className="grid grid-cols-3 border-[#3A302A] border-t pt-[10px]">
					{PRICES.map((drink) => (
						<div key={drink.name} className={drink.align}>
							<div className="font-[Menlo] text-[5px] text-[#9C9287] uppercase leading-none tracking-[0.16em]">
								{drink.name}
							</div>
							<div className="mt-[5px] font-serif text-[10.5px] text-[#E7DAC8] leading-none">{drink.kr}</div>
						</div>
					))}
				</div>
				<div className="mt-[17px] flex h-[34px] items-center justify-center gap-[6px] rounded-full bg-[#F2E7D6] font-serif text-[11px] text-[#17100D]">
					Fyll koppen
					<svg viewBox="0 0 20 20" className="h-[9px] w-[9px]" fill="none" aria-hidden="true">
						<path
							d="M3 10h13.5M11.5 5l5 5-5 5"
							stroke="#17100D"
							strokeWidth="1.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
				<p className="mt-[10px] text-center font-[Menlo] text-[5.5px] text-[#9C9287] uppercase tracking-[0.18em]">
					Öppet till 18 i dag
				</p>
			</div>
		</div>
	);
}
