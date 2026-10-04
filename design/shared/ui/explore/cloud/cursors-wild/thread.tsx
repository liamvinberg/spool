import { NameTag, type TakeState, cast, groups, here, seat, tint } from "shared/ui/explore/cloud/cursors-wild/common";
import { FaceRow, WhoList } from "shared/ui/explore/cloud/cursors-wild/faces";
import { Loop } from "shared/ui/explore/cloud/cursors-wild/loop";
import { Scene, TheirSelection } from "shared/ui/explore/cloud/cursors-wild/scene";
import {
	camera,
	frameUnder,
	INES,
	LOOP_MS,
	MAJA,
	MOMENTS,
	type Person,
	pointer,
	ramp,
	receiptHeld,
	trail,
} from "shared/ui/explore/cloud/cursors-wild/script";

/**
 * Thread: a hand is a point that pays out a short thread behind it.
 *
 * The thread is the last 600ms of where the hand went, so it says direction and
 * speed at a glance, and a gesture reads as the shape it drew: circling Pay
 * leaves a loop around Pay. When the hand stops the thread reels back into the
 * point and the canvas goes quiet, which is most of the day. The name only
 * shows on a hand that has stopped or pressed, since a hand that stops is
 * usually a hand that means something.
 */

export function ThreadTake({ state }: { state: TakeState }) {
	return (
		<Loop duration={LOOP_MS} moments={MOMENTS} start={4300}>
			{(t) => <ThreadScene state={state} t={t} />}
		</Loop>
	);
}

function ThreadScene({ state, t }: { state: TakeState; t: number }) {
	const people = cast(state);
	const hands = here(people);
	const following = state === "follow" ? MAJA.id : undefined;
	const held = receiptHeld(t);
	return (
		<Scene
			t={t}
			camera={state === "follow" ? camera(t) : undefined}
			header={
				<FaceRow
					seats={hands.map((person) => seat(person, t))}
					following={following}
					count={state === "crowd" ? people.length : undefined}
					open={state === "crowd"}
				/>
			}
			labelEnd={(place) =>
				place.name === "receipt" && held ? (
					<span className="type-detail" style={{ color: INES.color }}>
						{INES.name.toLowerCase()}
					</span>
				) : null
			}
			onFrame={(place) => (place.name === "receipt" && held ? <TheirSelection color={INES.color} /> : null)}
			panel={state === "crowd" ? <WhoList groups={groups(people, t)} /> : null}
			world={
				<>
					{hands.map((person) => (
						<ThreadHand key={person.id} person={person} t={t} />
					))}
				</>
			}
			overlay={state === "follow" ? <FollowLine person={MAJA} /> : null}
		/>
	);
}

const SEGMENTS = 48;

function ThreadHand({ person, t }: { person: Person & { track: NonNullable<Person["track"]> }; t: number }) {
	const at = pointer(person.track, t);
	const points = trail(person.track, t, 800, 800 / SEGMENTS);
	// over a frame the point wears a ring: the thread has caught on something
	const caught = frameUnder(t, at.x, at.y) !== null;
	const idle = ramp(at.idleFor, 0, 600);
	const named = at.idle ? 0 : at.pressed ? 1 : ramp(at.still, 450, 250);
	// one ring goes out when a press lands, and is gone in 420ms
	const press = at.pressed ? Math.min(1, at.held / 420) : 1;
	return (
		<>
			<svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
				{points.slice(1).map((point, index) => {
					const prev = points[index] ?? point;
					const fade = 1 - index / SEGMENTS;
					return (
						<line
							// biome-ignore lint/suspicious/noArrayIndexKey: a segment is its age, nothing else
							key={index}
							x1={prev.x}
							y1={prev.y}
							x2={point.x}
							y2={point.y}
							stroke={person.color}
							strokeOpacity={0.75 * fade * fade}
							strokeWidth={0.6 + 1.4 * fade}
							strokeLinecap="round"
						/>
					);
				})}
				<circle
					cx={at.x}
					cy={at.y}
					r={8}
					fill="none"
					stroke={person.color}
					strokeWidth={1}
					style={{ opacity: caught && !at.idle ? 0.45 : 0, transition: "opacity 160ms ease-out" }}
				/>
				{at.pressed ? (
					<circle
						cx={at.x}
						cy={at.y}
						r={6 + 12 * press}
						fill="none"
						stroke={person.color}
						strokeWidth={1.25}
						strokeOpacity={0.6 * (1 - press)}
					/>
				) : null}
				{/* a hairline of the app's black, so a light colour still holds on a white frame */}
				<circle cx={at.x} cy={at.y} r={(at.pressed ? 4.5 : 5.5) + idle * 0.5} fill="#0e0e0e" fillOpacity={0.55 * (1 - idle * 0.6)} />
				<circle
					cx={at.x}
					cy={at.y}
					r={(at.pressed ? 3 : 4) + idle * 0.5}
					fill={tint(person.color, 1 - idle)}
					stroke={person.color}
					strokeWidth={1.25}
					strokeOpacity={0.5 + 0.5 * (1 - idle)}
					style={{ opacity: 1 - idle * 0.5, transition: "r 120ms ease-out" }}
				/>
			</svg>
			<span className="pointer-events-none absolute" style={{ left: at.x + 9, top: at.y + 6, opacity: named }}>
				<NameTag name={person.name} color={person.color} />
			</span>
		</>
	);
}

/** following: a line of their colour across the top of the field, and the way out on it */
function FollowLine({ person }: { person: Person }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 top-0 z-10">
			<div className="h-[2px]" style={{ background: person.color }} />
			<div className="flex justify-center">
				<span className="rounded-b-xs px-2 py-[3px] text-[#0e0e0e] type-detail" style={{ background: person.color }}>
					following {person.name.toLowerCase()} · esc stops
				</span>
			</div>
		</div>
	);
}
