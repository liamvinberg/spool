import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

/**
 * Four ambient takes on the boot gap, for the same `BootShell` chrome the other
 * boot frames use. Ambient means the field claims nothing: no count, no bar, no
 * guess at what the project holds. One object, well made, occupying the wait.
 *
 * The field the canvas gives them is 892 x 856 — the frame minus both rails and
 * the 44px bar — so every viewBox here is that box and one user unit is one px.
 */

const FIELD = "0 0 892 856";

/* -------------------------------------------------------------------- slack */

const SLACK_Y = 330;
const SLACK_X0 = -60;
const SLACK_X1 = 952;
const SLACK_C1 = SLACK_X0 + (SLACK_X1 - SLACK_X0) / 3;
const SLACK_C2 = SLACK_X0 + ((SLACK_X1 - SLACK_X0) * 2) / 3;

/** a cubic whose two controls share one offset sags to exactly 3/4 of it */
function hang(sag: number): string {
	const k = (SLACK_Y + sag * (4 / 3)).toFixed(1);
	return `M ${SLACK_X0} ${SLACK_Y} C ${SLACK_C1} ${k} ${SLACK_C2} ${k} ${SLACK_X1} ${SLACK_Y}`;
}

/**
 * The whole design is the ease curve. A winch somewhere off the left edge takes
 * the slack up: the pull leans in, overshoots taut so the line bows the wrong
 * way for a sixth of a second, settles, holds, then pays back out slowly and
 * lands a little past its rest before it comes back. Tension reads as
 * brightness, so the line is dimmest at its heaviest.
 */
const SAG = [170, 170, -7, 6, 2, 2, 184, 170, 170];
const SAG_TIMES = [0, 0.065, 0.185, 0.235, 0.27, 0.47, 0.8, 0.9, 1];

export function SlackBoot() {
	const sag = useMotionValue(170);
	const d = useTransform(sag, hang);
	const opacity = useTransform(sag, [0, 170], [1, 0.46]);
	useEffect(() => {
		const run = animate(sag, SAG, {
			duration: 4.6,
			times: SAG_TIMES,
			ease: ["linear", "easeIn", "easeOut", "easeOut", "linear", "easeInOut", "easeOut", "linear"],
			repeat: Number.POSITIVE_INFINITY,
		});
		return () => run.stop();
	}, [sag]);
	return (
		<svg className="absolute inset-0 h-full w-full" viewBox={FIELD} fill="none" aria-hidden="true">
			<motion.path
				d={d}
				style={{ opacity }}
				stroke="var(--color-thread)"
				strokeWidth={1.5}
				strokeLinecap="round"
			/>
		</svg>
	);
}

/* --------------------------------------------------------------------- wrap */

/**
 * The identity path, split at its nine subpaths — the nine wraps of ribbon the
 * mark is actually made of. Copied from `spool-mark.tsx` because design/ has no
 * export for the raw path and that file belongs to the identity, not to this
 * exploration.
 */
const BANDS: readonly string[] = [
	"M 441.500 188.662 C 422.070 189.413, 388.412 191.274, 371.428 192.538 C 356.315 193.662, 349.569 194.664, 338.928 197.368 C 331.543 199.244, 323.025 201.728, 320 202.888 C 311.090 206.304, 304.179 210.772, 301.469 214.868 C 300.075 216.974, 298.434 221.390, 297.822 224.683 C 296.905 229.613, 297.003 231.978, 298.378 238.085 C 300.127 245.850, 306.286 259.381, 310.403 264.500 C 312.719 267.381, 312.947 267.447, 316.157 266.161 C 325.050 262.599, 343.811 256.545, 355.500 253.466 C 388.527 244.767, 417.646 240.318, 496 232.003 C 580.468 223.039, 616.554 217.746, 652.500 209.047 C 661.300 206.917, 673.675 203.480, 680 201.409 L 691.500 197.644 687 196.831 C 673.460 194.385, 624.640 190.546, 587.500 189.007 C 566.676 188.143, 461.359 187.895, 441.500 188.662",
	"M 762.691 222.139 C 758.121 226.627, 744.378 233.494, 730 238.473 C 697.061 249.881, 637.695 261.384, 572.500 268.992 C 472.663 280.642, 436.032 286.291, 399.500 295.670 C 387.399 298.776, 367.978 304.982, 357.241 309.173 C 355.448 309.873, 354.132 310.908, 354.316 311.473 C 354.726 312.730, 374.529 330.751, 384.160 338.631 L 391.182 344.376 397.341 342.661 C 444.868 329.429, 479.624 322.722, 564 310.502 C 614.084 303.249, 631.766 300.405, 655 295.867 C 718.214 283.520, 758.367 268.086, 768.054 252.412 C 770.103 249.097, 770.229 247.980, 769.714 237.663 C 769.408 231.523, 768.559 224.677, 767.829 222.449 L 766.500 218.399 762.691 222.139",
	"M 747.405 305.109 C 744.761 308.036, 723.455 318.192, 712 321.985 C 706.775 323.715, 695.750 326.883, 687.500 329.024 C 663.804 335.174, 643.086 339.205, 572 351.494 C 534.511 357.974, 495.609 365.424, 478.304 369.436 C 462.892 373.009, 433.374 381.292, 432.330 382.337 C 431.999 382.668, 437.920 389.477, 445.488 397.469 C 453.056 405.461, 459.307 412, 459.380 412 C 459.453 412, 461.085 411.532, 463.007 410.961 C 470.574 408.710, 502.440 400.897, 519.500 397.110 C 529.400 394.912, 556.625 389.246, 580 384.518 C 623.577 375.705, 646.947 370.375, 665.786 364.955 C 692.529 357.261, 711.092 349.293, 725.482 339.332 C 731.359 335.263, 733.347 333.075, 738.053 325.499 C 749.045 307.803, 753.246 298.643, 747.405 305.109",
	"M 691.500 385.164 C 683.239 391.415, 664.871 399.405, 642.982 406.269 C 628.165 410.915, 607.464 416.356, 577.500 423.482 C 535.145 433.554, 511.948 439.722, 492.760 446.013 C 482.454 449.392, 473.857 452.459, 473.657 452.829 C 473.456 453.198, 478.797 457.136, 485.524 461.580 L 497.756 469.659 516.128 464.822 C 526.233 462.161, 543.050 457.713, 553.500 454.936 C 622.050 436.724, 655.594 422.010, 679.657 399.597 C 686.502 393.221, 697.017 381.834, 695.843 382.068 C 695.654 382.106, 693.700 383.499, 691.500 385.164",
	"M 612 464.112 C 603.330 470.038, 586.059 477.959, 554.415 490.522 C 491.638 515.447, 468.318 529.030, 445.329 554.063 L 439.500 560.409 445.793 555.212 C 453.360 548.963, 467.539 540.490, 480.491 534.479 C 485.715 532.054, 500.678 525.506, 513.744 519.926 C 540.081 508.680, 567.547 495.260, 581.905 486.624 C 595.158 478.653, 619.176 461.157, 617 461.059 C 616.725 461.046, 614.475 462.420, 612 464.112",
	"M 511.500 559.732 C 507.650 561.149, 496.689 565.170, 487.143 568.666 C 436.273 587.298, 411.340 601.499, 380.627 629.334 C 377.141 632.494, 378.489 632.016, 384.500 627.962 C 396.878 619.613, 418.617 611.318, 460.264 599.053 C 477.079 594.101, 496.837 588.068, 504.169 585.645 C 522.326 579.647, 542.069 571.706, 541.685 570.556 C 541.269 569.308, 521.097 556.978, 519.635 557.078 C 519.011 557.120, 515.350 558.315, 511.500 559.732",
	"M 540 615.120 C 524.656 620.625, 491.990 628.702, 441.500 639.475 C 406.276 646.990, 396.912 649.402, 378.579 655.682 C 362.653 661.137, 347.105 668.998, 336.567 676.924 C 328.202 683.215, 312.964 697.757, 307.671 704.500 L 304.532 708.500 308.309 705.243 C 313.108 701.104, 321.090 697.079, 332.421 693.082 C 351.893 686.214, 372.922 681.639, 413 675.550 C 494.043 663.238, 530.838 655.853, 563.077 645.431 C 569.085 643.489, 574 641.397, 574 640.783 C 574 639.315, 547.908 612.978, 546.548 613.073 C 545.971 613.113, 543.025 614.034, 540 615.120",
	"M 602.500 681.180 C 593.129 684.883, 571.535 690.945, 553.500 694.936 C 519.695 702.417, 489.342 706.882, 420.500 714.503 C 362.911 720.877, 343.071 723.732, 323.484 728.464 C 300.415 734.037, 285.942 740.164, 276.348 748.417 C 273.974 750.458, 268.958 757.265, 264.638 764.306 C 254.877 780.218, 254.573 781.047, 259.916 777.176 C 270.125 769.780, 298.090 763.851, 345.500 759.030 C 356.500 757.912, 387.775 755.192, 415 752.987 C 496.683 746.369, 523.230 743.556, 557.500 737.889 C 590.433 732.443, 617.695 725.499, 636.049 717.882 C 641.548 715.600, 646.245 713.413, 646.486 713.023 C 646.728 712.632, 641.006 707.180, 633.772 700.906 C 626.538 694.633, 617.895 687.138, 614.567 684.250 C 611.238 681.362, 608.286 679.046, 608.007 679.102 C 607.728 679.159, 605.250 680.094, 602.500 681.180",
	"M 679 759.565 C 638.381 776.236, 580.784 785.567, 473 792.940 C 456.775 794.050, 429.325 795.886, 412 797.021 C 352.172 800.939, 303.999 805.928, 276.760 811.027 C 270.303 812.235, 265.260 813.611, 265.552 814.085 C 266.514 815.640, 278.802 818.907, 293.276 821.454 C 322.734 826.640, 363.431 830.953, 413.500 834.197 C 440.735 835.962, 565 835.971, 593 834.211 C 653.158 830.428, 664.242 829.014, 681.688 822.899 C 692.872 818.978, 699.844 815.022, 704.343 810.043 C 706.295 807.881, 708.417 804.175, 709.058 801.807 C 710.930 794.887, 709.719 786.040, 705.765 777.760 C 702.502 770.927, 691.364 754.849, 690.086 755.128 C 689.764 755.198, 684.775 757.194, 679 759.565",
];

const WRAP_CYCLE = 2.6;
const WRAP_STEP = 0.24;
const WRAP_TIMES = [0, 0.07, 0.13, 0.3, 1];

/**
 * The mark at 420px, wound rather than lit. Every band rests at a fourteenth of
 * its weight; the light arrives band by band from the top and takes the length
 * of the ribbon to reach the bottom, and each band slides 16 units along its own
 * axis as it takes. Nothing ever completes, so nothing has to reset: the wave
 * leaves the last band as the next one starts at the top.
 */
export function WrapBoot() {
	return (
		<div className="flex h-full items-center justify-center pb-14">
			<svg
				viewBox="250 182 524 660"
				className="h-[420px] w-[333px]"
				fill="var(--color-thread)"
				fillRule="evenodd"
				aria-hidden="true"
			>
				{BANDS.map((band, index) => (
					<motion.path
						key={band.slice(0, 16)}
						d={band}
						initial={{ fillOpacity: 0.07, x: 0 }}
						animate={{ fillOpacity: [0.07, 1, 0.62, 0.07, 0.07], x: [16, 0, 0, 0, 0] }}
						transition={{
							duration: WRAP_CYCLE,
							times: WRAP_TIMES,
							ease: ["easeOut", "linear", "easeIn", "linear"],
							delay: index * WRAP_STEP,
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>
				))}
			</svg>
		</div>
	);
}

/* --------------------------------------------------------------------- knot */

const KNOT_X = 452;
const KNOT_S = 1.5;

/**
 * One rope hanging the whole height of the field with a single loop tied loose
 * in it. The loop is a fixed shape carried down the rope: the strand enters at
 * `cy` on the left of centre, curls out and over, and crosses back to the right
 * of centre on the way down, so the two strands read as one passing the other.
 * The tails always run past both edges, so the rope itself never appears.
 */
function loop(cy: number): string {
	const at = (dx: number, dy: number) => `${(KNOT_X + dx * KNOT_S).toFixed(1)} ${(cy + dy * KNOT_S).toFixed(1)}`;
	const inX = (KNOT_X - 7 * KNOT_S).toFixed(1);
	const outX = (KNOT_X + 7 * KNOT_S).toFixed(1);
	return [
		`M ${inX} -80`,
		`L ${at(-7, 22)}`,
		`C ${at(-7, 52)} ${at(-34, 64)} ${at(-56, 50)}`,
		`C ${at(-78, 36)} ${at(-82, 4)} ${at(-68, -18)}`,
		`C ${at(-54, -40)} ${at(-24, -42)} ${at(-10, -18)}`,
		`C ${at(-2, -5)} ${at(3, 8)} ${at(7, 26)}`,
		`L ${outX} 936`,
	].join(" ");
}

/**
 * Stick and slip. The loop holds where friction holds it, then goes — a burst
 * that arrests almost as fast as it started — and holds again somewhere lower.
 * It leaves at the bottom and comes back in at the top inside three hundredths
 * of a second, both of those positions well outside the field, so the loop is
 * never seen to jump. Every hold is a different length, so the rhythm never
 * lands on a beat you can count.
 */
const KNOT_CY = [400, 400, 620, 620, 980, -110, 110, 110, 400];
const KNOT_TIMES = [0, 0.16, 0.29, 0.45, 0.56, 0.565, 0.7, 0.86, 1];
const SLIP: [number, number, number, number] = [0.45, 0, 0.2, 1];

export function KnotBoot() {
	const cy = useMotionValue(400);
	const d = useTransform(cy, loop);
	useEffect(() => {
		const run = animate(cy, KNOT_CY, {
			duration: 6.4,
			times: KNOT_TIMES,
			ease: ["linear", SLIP, "linear", SLIP, "linear", SLIP, "linear", SLIP],
			repeat: Number.POSITIVE_INFINITY,
		});
		return () => run.stop();
	}, [cy]);
	return (
		<svg className="absolute inset-0 h-full w-full" viewBox={FIELD} fill="none" aria-hidden="true">
			<motion.path d={d} stroke="var(--color-thread)" strokeWidth={1.5} strokeLinecap="round" />
		</svg>
	);
}

/* -------------------------------------------------------------------- reach */

interface Leg {
	readonly d: string;
	readonly ex: number;
	readonly ey: number;
	/** second the leg starts drawing, and the second the take-up reaches it */
	readonly draw: number;
	readonly pull: number;
}

/**
 * Three legs of one route, each picking up forty units past the last one's head
 * so the gap between them is the width a frame would take. All three end level,
 * which is the one thing the canvas asks of a thread: the head points the way
 * the flow goes.
 */
const LEGS: readonly Leg[] = [
	{ d: "M 148 355 C 220 355 238 455 310 455", ex: 310, ey: 455, draw: 0.03, pull: 2.05 },
	{ d: "M 358 455 C 430 455 448 355 520 355", ex: 520, ey: 355, draw: 0.2, pull: 2.15 },
	{ d: "M 568 355 C 640 355 658 475 730 475", ex: 730, ey: 475, draw: 0.37, pull: 2.25 },
];

const REACH_CYCLE = 3;
const DRAW_S = 0.3;
const PULL_S = 0.55;

/**
 * The canvas rehearsing the one gesture it has. A thread grows out of nothing,
 * its head lands, and the next leg picks up past it — three hops across an empty
 * field, each turning the other way. Then all three are taken up at once, tail
 * first,
 * each leg pulled forward through its own head rather than erased backwards.
 * Nothing here says where the frames will be; it is the shape of a flow, drawn
 * in the air.
 */
export function ReachBoot() {
	return (
		<svg className="absolute inset-0 h-full w-full" viewBox={FIELD} fill="none" aria-hidden="true">
			{LEGS.map((leg) => {
				const lit = leg.draw / REACH_CYCLE;
				const laid = (leg.draw + DRAW_S) / REACH_CYCLE;
				const taken = leg.pull / REACH_CYCLE;
				const gone = (leg.pull + PULL_S) / REACH_CYCLE;
				return (
					<g key={leg.d}>
						<motion.path
							d={leg.d}
							stroke="var(--color-thread)"
							strokeWidth={1.5}
							initial={{ pathLength: 0, pathOffset: 0 }}
							animate={{ pathLength: [0, 0, 1, 1, 0, 0], pathOffset: [0, 0, 0, 0, 1, 1] }}
							transition={{
								duration: REACH_CYCLE,
								times: [0, lit, laid, taken, gone, 1],
								ease: ["linear", [0.2, 0.7, 0.2, 1], "linear", "easeIn", "linear"],
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
						<motion.path
							d={`M ${leg.ex + 8} ${leg.ey} l -9 -5 v 10 Z`}
							fill="var(--color-thread)"
							initial={{ opacity: 0, x: -3 }}
							animate={{ opacity: [0, 0, 1, 1, 0, 0], x: [-3, -3, 0, 0, 0, 0] }}
							transition={{
								duration: REACH_CYCLE,
								times: [0, laid - 0.02, laid, taken, taken + 0.08, 1],
								ease: ["linear", "easeOut", "linear", "easeIn", "linear"],
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
					</g>
				);
			})}
		</svg>
	);
}
