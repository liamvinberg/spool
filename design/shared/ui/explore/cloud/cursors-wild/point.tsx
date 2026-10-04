import { NameTag, type TakeState, cast, groups, here, seat, tint } from "shared/ui/explore/cloud/cursors-wild/common";
import { FaceRow, WhoList } from "shared/ui/explore/cloud/cursors-wild/faces";
import { Loop } from "shared/ui/explore/cloud/cursors-wild/loop";
import { Scene, TheirSelection } from "shared/ui/explore/cloud/cursors-wild/scene";
import {
	camera,
	ELEMENTS,
	type FramePlace,
	frameUnder,
	INES,
	LOOP_MS,
	MAJA,
	MOMENTS,
	type Person,
	pointer,
	ramp,
	receiptHeld,
} from "shared/ui/explore/cloud/cursors-wild/script";

/**
 * Point: a hand travelling is a quiet dot with no name, and a hand that rests
 * on something lights the thing itself.
 *
 * Most of a cursor's day is travel, and travel is noise to everyone else. What
 * people need from each other is "this one", so spool marks the element under a
 * resting hand, the actual button in the live frame, in that person's colour
 * with their name on it. Moving on lets it go. The dot only says where a hand
 * is; the outline says what it means.
 */

const DWELL = 450;

export function PointTake({ state }: { state: TakeState }) {
	return (
		<Loop duration={LOOP_MS} moments={MOMENTS} start={4300}>
			{(t) => <PointScene state={state} t={t} />}
		</Loop>
	);
}

type Hand = Person & { track: NonNullable<Person["track"]> };

interface Lit {
	person: Hand;
	frame: FramePlace;
	element: (typeof ELEMENTS)[FramePlace["name"]][number];
	strength: number;
}

/** the element a hand rests on, how strongly it is lit, or nothing */
function litBy(person: Hand, t: number): Lit | null {
	const at = pointer(person.track, t);
	let x = at.x;
	let y = at.y;
	let strength: number;
	if (at.moving) {
		// letting go: what the last rest lit fades as the hand leaves it
		if (at.before === null || at.before.held < DWELL + 200) return null;
		x = at.before.x;
		y = at.before.y;
		strength = 1 - ramp(at.movedFor, 0, 220);
	} else {
		strength = ramp(at.still, DWELL, 200) * (1 - ramp(at.idleFor, 0, 700));
	}
	if (strength <= 0 || at.pressed) return null;
	const frame = frameUnder(t, x, y);
	if (frame === null) return null;
	const element = ELEMENTS[frame.name].find(
		(candidate) =>
			x - frame.x >= candidate.x &&
			x - frame.x <= candidate.x + candidate.w &&
			y - frame.y >= candidate.y &&
			y - frame.y <= candidate.y + candidate.h,
	);
	return element === undefined ? null : { person, frame, element, strength };
}

function PointScene({ state, t }: { state: TakeState; t: number }) {
	const people = cast(state);
	const hands = here(people);
	const lit = hands.flatMap((person) => litBy(person, t) ?? []);
	const held = receiptHeld(t);
	return (
		<Scene
			t={t}
			camera={state === "follow" ? camera(t) : undefined}
			header={
				<FaceRow
					seats={hands.map((person) =>
						seat(person, t, lit.some((entry) => entry.person.id === person.id && entry.strength > 0.5)),
					)}
					following={state === "follow" ? MAJA.id : undefined}
					count={state === "crowd" ? people.length : undefined}
					open={state === "crowd"}
				/>
			}
			labelLit={(place) =>
				hands.some((person) => {
					const at = pointer(person.track, t);
					return !at.idle && frameUnder(t, at.x, at.y)?.name === place.name;
				})
			}
			labelEnd={(place) =>
				place.name === "receipt" && held ? <NameTag name={INES.name} color={INES.color} className="-mr-1.5" /> : null
			}
			onFrame={(place) => (
				<>
					{place.name === "receipt" && held ? <TheirSelection color={INES.color} /> : null}
					{lit
						.filter((entry) => entry.frame.name === place.name)
						.map((entry) => (
							<Outline key={entry.person.id} entry={entry} />
						))}
				</>
			)}
			panel={state === "crowd" ? <WhoList groups={groups(people, t)} /> : null}
			world={
				<>
					{hands.map((person) => (
						<PointHand key={person.id} person={person} t={t} />
					))}
				</>
			}
			overlay={state === "follow" ? <FollowRim person={MAJA} /> : null}
		/>
	);
}

function Outline({ entry }: { entry: Lit }) {
	const { element, person, strength } = entry;
	return (
		<div
			className="pointer-events-none absolute"
			style={{
				left: element.x - 3,
				top: element.y - 3,
				width: element.w + 6,
				height: element.h + 6,
				opacity: strength,
			}}
		>
			<div
				className="absolute inset-0 rounded-[8px] border-[1.5px]"
				style={{
					borderColor: person.color,
					background: tint(person.color, 0.1),
					transform: `scale(${0.985 + 0.015 * strength})`,
				}}
			/>
			<NameTag name={person.name} color={person.color} className="absolute -top-[19px] -left-px" />
		</div>
	);
}

function PointHand({ person, t }: { person: Hand; t: number }) {
	const at = pointer(person.track, t);
	const onFrame = frameUnder(t, at.x, at.y) !== null;
	const idle = ramp(at.idleFor, 0, 600);
	const presence = at.moving ? (onFrame ? 0.9 : 0.55) : 1;
	const size = at.pressed ? 6 : 8;
	return (
		<span
			className="pointer-events-none absolute rounded-full transition-[width,height,opacity] duration-150 ease-out"
			style={{
				left: at.x,
				top: at.y,
				width: size,
				height: size,
				transform: "translate(-50%, -50%)",
				background: tint(person.color, 1 - idle),
				border: `1.5px solid ${person.color}`,
				outline: `1.5px solid ${tint("#0e0e0e", 0.5 * (1 - idle * 0.6))}`,
				opacity: presence * (1 - idle * 0.55),
			}}
		/>
	);
}

/** following: the field takes their colour at its edge, and their name sits in the corner it starts from */
function FollowRim({ person }: { person: Person }) {
	return (
		<div className="pointer-events-none absolute inset-0 z-10 border-[1.5px]" style={{ borderColor: person.color }}>
			<span
				className="absolute top-0 left-0 rounded-br-xs px-2 py-[3px] text-[#0e0e0e] type-detail"
				style={{ background: person.color }}
			>
				following {person.name.toLowerCase()} · esc stops
			</span>
		</div>
	);
}
