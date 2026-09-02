/**
 * `home`, the one frame on the kaffe project's `site` page.
 *
 * It exists because the transcript behind the #143 frames names it. That capture
 * (fixtures/captures/claude-edits.json) spends two minutes editing
 * `frames/home/frame.tsx` and nothing else, so `home` has to be a frame you can
 * actually be taken to for the question to be lookable at — and #136's threads
 * frames had already put it on `site`, one page over from the `app` page the
 * canvas is showing. That gap is the whole point: the rows name a frame that is
 * not on screen.
 *
 * The capture's own `home` is a Swedish task list, and its contents are elided in
 * the fixture, so this is not a reconstruction of it and does not pretend to be.
 * It is kaffe's own site home, at the 390x844 the capture's frame.json records,
 * carried into the 240x520 box the canvas draws every frame in — every value here
 * is the real one times 0.615, the same rule coffee-empty-takes.tsx follows, so
 * one scale factor covers the whole canvas and the zoom readout stays honest.
 *
 * Palette is the coffee screens' unchanged: paper, one ink, one grey, one surface.
 */

export function KaffeHome() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]">
			<div className="flex h-[26px] shrink-0 items-center justify-between border-[#E4E4E7] border-b px-3">
				<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
				<span className="flex flex-col gap-[3px]">
					<span className="block h-px w-[11px] bg-[#17171A]" />
					<span className="block h-px w-[11px] bg-[#17171A]" />
				</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[17px] tracking-tight leading-[20px]">
					Bryggt på Torsgatan sedan 2016
				</h1>
				<p className="mt-[7px] max-w-[168px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Ljusrostade bönor, malda i baren. Öppet varje dag från sju.
				</p>
				<div className="mt-3 flex h-[26px] w-[92px] shrink-0 items-center justify-center rounded-[3px] bg-[#17171A] text-[8.5px] text-[#FEFEFE] leading-3">
					Beställ nu
				</div>
				<div className="mt-4 h-[148px] shrink-0 rounded-md bg-[#EFEFF1]" />
				<div className="mt-4 flex flex-col gap-[7px]">
					{[
						{ day: "Mån till fre", hours: "07 — 18" },
						{ day: "Lördag", hours: "08 — 17" },
						{ day: "Söndag", hours: "09 — 16" },
					].map((row) => (
						<div key={row.day} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.day}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.hours}</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex h-[30px] shrink-0 items-center border-[#E4E4E7] border-t px-3">
				<span className="text-[8px] text-[#86868B] leading-3">Torsgatan 11, Stockholm</span>
			</div>
		</div>
	);
}
