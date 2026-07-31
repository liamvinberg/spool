/**
 * The two frames `home` sits between.
 *
 * This variation puts `home` in the middle column on purpose, because the middle
 * is the hard case: three 152px frames at 114, 310 and 506 in a 772px viewport
 * leave 114 of open field at each end of the row and 44 between neighbours, and
 * 44 is the number the parent direction measured and then stepped around by
 * putting its subject on the end. So `home` needs a neighbour on each side, and
 * neither of them is ever named by the capture: all twenty-one rows in
 * `claude-edits` name `home`.
 *
 * They follow `kaffe-home.tsx`'s rule exactly — kaffe's own site at 390x844,
 * carried into the 240x520 box the canvas draws every frame in, so every value is
 * the real one times 0.615 and the zoom readout stays honest. Same palette: paper,
 * one ink, one grey, one surface.
 */

function Chrome({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]">
			<div className="flex h-[26px] shrink-0 items-center justify-between border-[#E4E4E7] border-b px-3">
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				<span className="flex flex-col gap-[3px]">
					<span className="block h-px w-[11px] bg-[#17171A]" />
					<span className="block h-px w-[11px] bg-[#17171A]" />
				</span>
			</div>
			{children}
			<div className="flex h-[30px] shrink-0 items-center border-[#E4E4E7] border-t px-3">
				<span className="text-[8px] text-[#86868B] leading-3">Torsgatan 11, Stockholm</span>
			</div>
		</div>
	);
}

/** `beans` — what is on the shelf this week */
export function KaffeBeans() {
	return (
		<Chrome>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">Bönor över disk</h1>
				<p className="mt-[7px] max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Vi rostar på tisdagar. Påsen är 250 gram och mals i baren om du vill.
				</p>
				<div className="mt-4 flex flex-col gap-[9px]">
					{[
						{ name: "Kochere", note: "Etiopien, tvättad", price: "185 kr" },
						{ name: "La Palma", note: "Colombia, honung", price: "165 kr" },
						{ name: "Husets", note: "Blandning, mörkare", price: "139 kr" },
					].map((bean) => (
						<div key={bean.name} className="flex items-start justify-between border-[#EFEFF1] border-b pb-[9px]">
							<span className="flex flex-col gap-[3px]">
								<span className="font-semibold text-[9px] leading-3">{bean.name}</span>
								<span className="text-[8px] text-[#86868B] leading-3">{bean.note}</span>
							</span>
							<span className="text-[8.5px] leading-3">{bean.price}</span>
						</div>
					))}
				</div>
				<div className="mt-4 h-[74px] shrink-0 rounded-md bg-[#EFEFF1]" />
			</div>
		</Chrome>
	);
}

/** `visit` — the room, and when it is open */
export function KaffeVisit() {
	return (
		<Chrome>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">Hitta hit</h1>
				<p className="mt-[7px] max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Torsgatan 11, en trappa upp från tunnelbanan. Köket stänger en timme innan baren gör det.
				</p>
				<div className="mt-4 h-[104px] shrink-0 rounded-md bg-[#EFEFF1]" />
				<div className="mt-4 flex flex-col gap-[7px]">
					{[
						{ day: "Måndag till fredag", hours: "07 till 18" },
						{ day: "Lördag", hours: "08 till 17" },
						{ day: "Söndag", hours: "09 till 16" },
						{ day: "Röda dagar", hours: "Stängt" },
					].map((row) => (
						<div key={row.day} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.day}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.hours}</span>
						</div>
					))}
				</div>
			</div>
		</Chrome>
	);
}
