/**
 * The two frames nobody touches.
 *
 * This direction says everything by comparison, so the neighbours are not scenery
 * here the way they are in `agent-hand--presence`: they are half the drawing. A
 * page holding one frame cannot show a held one at all, which is the honest floor
 * of the whole idea and is stated on the frame.
 *
 * They are the parent's two, unchanged on purpose, so the two canvases can be put
 * side by side and the only difference between them is what the agent's state is
 * made of. Same rule as `kaffe-home.tsx`: kaffe's own site at 390x844 carried into
 * the 240x520 box, every value the real one times 0.615.
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

/** `about` — who roasts the beans */
export function KaffeAbout() {
	return (
		<Chrome>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">
					Fyra personer och en rostare
				</h1>
				<p className="mt-[7px] max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Baren öppnade 2016. Sedan 2019 rostar vi allt vi häller upp, en gata bort.
				</p>
				<div className="mt-4 h-[112px] shrink-0 rounded-md bg-[#EFEFF1]" />
				<div className="mt-4 flex flex-col gap-[7px]">
					{[
						{ label: "Rosteri", value: "Sundbyberg" },
						{ label: "Bönor", value: "Colombia, Etiopien" },
						{ label: "Bryggare", value: "Marco" },
					].map((row) => (
						<div key={row.label} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.label}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.value}</span>
						</div>
					))}
				</div>
			</div>
		</Chrome>
	);
}

/** `hours` — when the bar is open */
export function KaffeHours() {
	return (
		<Chrome>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">Öppettider</h1>
				<p className="mt-[7px] max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Köket stänger en timme innan baren gör det.
				</p>
				<div className="mt-4 flex flex-col gap-[9px]">
					{[
						{ day: "Måndag till fredag", hours: "07 till 18" },
						{ day: "Lördag", hours: "08 till 17" },
						{ day: "Söndag", hours: "09 till 16" },
						{ day: "Röda dagar", hours: "Stängt" },
					].map((row) => (
						<div key={row.day} className="flex items-baseline justify-between border-[#EFEFF1] border-b pb-[9px]">
							<span className="text-[8.5px] leading-3">{row.day}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.hours}</span>
						</div>
					))}
				</div>
				<p className="mt-4 max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Bönor säljs över disk så länge lagret räcker.
				</p>
			</div>
		</Chrome>
	);
}
