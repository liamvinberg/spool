import { cn } from "shared/lib/utils";
import type { Person } from "shared/ui/explore/cloud/cursors-motion/engine";

/**
 * Who is looking, at the top right of the window. Every number here is handed
 * in from the clock, so a face arrives, lights and dims exactly when the
 * canvas says it should, and the scrub bar can stop it anywhere.
 */

export interface Face {
	readonly person: Person;
	/** 0 gone, 1 here; the stack makes room for a face as it arrives */
	readonly arrive: number;
	/** 0 awake, 1 idle */
	readonly idle: number;
	/** 0 still, 1 moving: a short line under the face */
	readonly lit: number;
	/** the page they are on, when it is not this one */
	readonly away?: string | undefined;
	/** what the who's-here list says about them, verbatim */
	readonly note?: string | undefined;
	readonly followed?: boolean | undefined;
}

const SIZE = 22;
const STEP = 17;

export function Faces({
	faces,
	wind = false,
	open = false,
}: {
	faces: readonly Face[];
	/** faces wind on as a ring and fill once it closes, rather than fading */
	wind?: boolean | undefined;
	open?: boolean | undefined;
}) {
	const here = faces.filter((face) => face.arrive > 0.001);
	return (
		<div className="relative flex h-full items-center">
			<span className="mr-3 h-[18px] w-px bg-border-raised" />
			<button
				type="button"
				aria-expanded={open}
				aria-label="Who is here"
				className={cn(
					"flex h-8 items-center rounded-sm pr-1.5 pl-1 transition-colors duration-[140ms] hover:bg-surface",
					open && "bg-surface",
				)}
			>
				<span className="relative flex h-[30px] items-center">
					{here.map((face, i) => (
						<span
							key={face.person.id}
							className="relative h-[30px] shrink-0"
							style={{ width: i === here.length - 1 ? SIZE * face.arrive : STEP * face.arrive, zIndex: here.length - i }}
						>
							<FaceDisc face={face} wind={wind} />
						</span>
					))}
				</span>
				<span className="ml-2 text-muted tabular-nums type-detail">{here.length}</span>
			</button>
		</div>
	);
}

export function FaceDisc({ face, wind, size = SIZE }: { face: Face; wind: boolean; size?: number | undefined }) {
	const away = face.away !== undefined;
	const fill = wind ? Math.min(1, Math.max(0, face.arrive * 2 - 1)) : 1;
	const scale = wind ? 1 : 0.7 + 0.3 * face.arrive;
	const r = size / 2 - 1;
	const circumference = 2 * Math.PI * r;
	return (
		<span
			className="absolute top-1/2 left-0"
			style={{
				width: size,
				height: size,
				transform: `translateY(-50%) scale(${scale})`,
				opacity: (wind ? 1 : face.arrive) * (1 - 0.55 * face.idle),
				filter: face.idle > 0.01 ? `saturate(${1 - 0.8 * face.idle})` : undefined,
			}}
		>
			<span
				className="absolute inset-0 flex items-center justify-center rounded-full font-semibold text-[10px] leading-none"
				style={{
					background: away ? "var(--color-bg)" : face.person.color,
					color: away ? face.person.color : "#0e0e0e",
					boxShadow: `0 0 0 2px var(--color-bg)${away ? `, inset 0 0 0 1.25px ${face.person.color}` : ""}`,
					opacity: away ? 1 : fill,
				}}
			>
				{face.person.name.charAt(0)}
			</span>
			{wind && fill < 1 ? (
				<svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 absolute inset-0" aria-hidden="true">
					<circle
						cx={size / 2}
						cy={size / 2}
						r={r}
						fill="none"
						stroke={face.person.color}
						strokeWidth="1.5"
						strokeDasharray={circumference}
						strokeDashoffset={circumference * (1 - Math.min(1, face.arrive * 2))}
						strokeLinecap="round"
					/>
				</svg>
			) : null}
			{face.followed === true ? (
				<span className="absolute -inset-[4px] rounded-full border-[1.5px]" style={{ borderColor: face.person.color }} />
			) : null}
			<span
				className="absolute -bottom-[6px] left-1/2 h-[2px] rounded-full"
				style={{ width: 10, transform: `translateX(-50%) scaleX(${face.lit})`, background: face.person.color, opacity: face.lit }}
			/>
		</span>
	);
}

/**
 * The list a press on the faces opens. It hangs in the canvas just under the
 * header, so it is drawn by the stage rather than inside the header bar.
 */
export function WhoList({ faces }: { faces: readonly Face[] }) {
	const local = faces.filter((face) => face.away === undefined);
	const away = faces.filter((face) => face.away !== undefined);
	return (
		<div className="flex w-[264px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit">
			{local.map((face) => (
				<WhoRow key={face.person.id} face={face} />
			))}
			<div className="mx-auto my-1 h-px w-[240px] bg-border-raised" />
			{away.map((face) => (
				<WhoRow key={face.person.id} face={face} />
			))}
			<div className="mx-auto my-1 h-px w-[240px] bg-border-raised" />
			<div className="flex h-[30px] items-center gap-2.5 rounded-sm px-2.5 text-muted">
				<span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-raised text-[9px] leading-none">L</span>
				<span className="min-w-0 flex-1 type-control">You</span>
				<span className="type-detail">app</span>
			</div>
		</div>
	);
}

function WhoRow({ face }: { face: Face }) {
	return (
		<div className="flex h-[30px] items-center gap-2.5 rounded-sm px-2.5 hover:bg-border-raised/60">
			<span className="relative h-[18px] w-[18px] shrink-0">
				<FaceDisc face={{ ...face, lit: 0 }} wind={false} size={18} />
			</span>
			<span className={cn("min-w-0 flex-1 truncate type-control", face.idle > 0.5 ? "text-muted" : "text-text")}>
				{face.person.name}
			</span>
			<span className="text-muted type-detail">{face.note ?? face.away ?? "app"}</span>
		</div>
	);
}
