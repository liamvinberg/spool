# Missed vsyncs while panning at working zoom (DEV-297)

The question: `bench/qa-editing.ts` on the M1 Pro (120 Hz ProMotion) puts
about a fifth of pan and zoom rAF intervals over 12 ms (a missed 8.3 ms vsync),
with p95 near 16.7 ms at k = 0.85 and 0.45. Is that spool's, and can spool
move it?

Answer: no. A plain HTML page with no spool, no iframes and no WebGL, moved by
the same wheel events, misses the same share. A Chrome trace shows why, on
spool and on the plain page alike: the renderer compositor's frame-deadline
timer fires late, by about one vsync, while its thread sits idle. That is the OS
waking a Chromium thread late. Nothing in the page shortens it.

## Setup

- M1 Pro, built-in Liquid Retina XDR at 120 Hz, on AC power, low power mode
  off.
- Playwright Chromium 149.0.7827.55, headed. Google Chrome 155.0.8059.40
  (`--channel chrome`) gives the same result.
- The qa141 subject project, page `app`, camera on `app/spool-player` as
  `qa-editing` places it.
- Gestures are qa-editing's: 70 wheel events of ±26 px, then 50 ctrl-wheel
  events of ±4, each followed by a 16 ms sleep.
- Bench: `bench/pan-trace.ts`. Variants are injected after the canvas settles,
  and every row alternates order across 3 rounds.

## The ticket's numbers (qa-editing, 2 runs each)

| k    | pan p95       | pan > 12 ms           | zoom p95      | zoom > 12 ms            |
| ---- | ------------- | --------------------- | ------------- | ----------------------- |
| 0.85 | 16.8 / 16.9 ms | 59/261, 55/274 (~21%) | 17.1 / 16.7 ms | 100/390, 44/191 (~24%) |
| 0.45 | 16.8 / 17.0 ms | 52/254, 46/254 (~19%) | 16.5 / 16.5 ms | 74/388, 62/368 (~18%)  |

`bench/canvas.ts --throttle 1 --headed` paces its gestures differently and
reports much less: at k = 0.85, pan 7/185 and zoom 21/137 over 12 ms; at
k = 0.45, pan 9/189 and zoom 4/135. The ticket's "about 2% at k = 0.45" is
that bench, not qa-editing.

## What each candidate changes (share of intervals over 12 ms; p95 is 16.6–17.1 ms in every row)

| run                                   | pan   | zoom  | idle, no input |
| ------------------------------------- | ----- | ----- | -------------- |
| k 0.85 base                           | 19.9% | 20.1% | 44.6%          |
| k 0.85 nolive (no iframe drawn)       | 19.9% | 18.4% | 40.4%          |
| k 0.85 stills (every document still)  | 19.6% | 18.4% | –              |
| k 0.85 willchange (camera promoted)   | 20.4% | 17.8% | –              |
| k 0.85 nogl (picture layer hidden)    | 20.7% | 17.7% | 44.8%          |
| k 0.85 nolive+nogl                    | 23.5% | 20.9% | 47.4%          |
| **k 0.85 control (plain page)**       | 18.6% | 19.8% | 48.7%          |
| k 0.45 base                           | 19.6% | 17.6% | 42.6%          |
| k 0.45 nolive                         | 19.6% | 16.6% | 39.7%          |
| **k 0.45 control**                    | 23.2% | 19.4% | 52.1%          |
| k 0.85 base, dpr 2                    | 20.6% | 21.6% | 44.4%          |
| k 0.85 control, dpr 2                 | 21.1% | 18.1% | 39.6%          |
| k 0.85 base, Chrome 155               | 21.0% | 21.2% | 43.8%          |
| k 0.85 control, Chrome 155            | 18.7% | 18.4% | 47.6%          |

Repeat runs of the same row move by 2–4 points. Every spool variant falls
inside the spread of the plain page. The following changed nothing:

- live iframes, and `ComputeCompositingRect` re-rastering them on scale
  (`nolive`, `stills`)
- the WebGL picture layer (`nogl`)
- layer promotion (`willchange`)
- device pixel ratio
- window size
- making the browser frontmost (`--front`)
- one persistent rAF loop instead of one per gesture (`--persistent`)
- `planCamera`'s densest band instead of qa-editing's camera (`--camera plan`)

With no input at all, an idle rAF loop misses even more often (40–52%).

## The trace

`--trace` records one gesture set per variant. `--analyse` re-reads the saved
file.

| trace                    | long intervals                         | follow a deadline timer > 2 ms late | of the late timers, fired on an idle thread |
| ------------------------ | -------------------------------------- | ----------------------------------- | ------------------------------------------- |
| k 0.85 base              | pan 61/274, zoom 51/193                | 54/61, 48/51                        | 159/162                                     |
| k 0.85 nolive            | pan 88/292, zoom 50/213                | 86/88, 47/50                        | 223/226                                     |
| k 0.85 control (no spool) | pan 42/261, zoom 25/183, idle 48/129  | 42/42, 25/25, 48/48                 | 149/149                                     |

What the trace shows:

- `CVDisplayLink` and `ExternalBeginFrameSourceMac::OnDisplayLinkCallback`
  tick every 8.3 ms throughout. The display and viz keep 120 Hz.
- On each BeginFrame the canvas's cc scheduler posts its frame deadline as a
  precise timer (`Scheduler::ScheduleBeginImplFrameDeadline`, usually mode
  `LATE`).
- In a long interval, `Scheduler::OnBeginImplFrameDeadline` runs 2–13 ms after
  that deadline, typically about 8 ms, and the Compositor thread has no task
  in between.
- The next BeginFrame then arrives while the previous one is still open. It
  is queued, then dropped with `SendDidNotProduceFrame` `kRecoverLatency` or
  `kNoDamage`, so the frame lands one vsync late.
- One pan window, quoted from `k0.85-nolive`:

  ```
  -0.10  ScheduleBeginImplFrameDeadline  deadline +5.8 ms, LATE
   3.97  Scheduler::BeginFrame           (next vsync, queued as pending)
  13.46  Scheduler::BeginFrame           dropped
  14.00  Scheduler::OnBeginImplFrameDeadline   (8.2 ms late; thread idle 0–13.4 ms)
  ```

- The canvas renderer's main thread spends 1.3–2.6 ms per interval in base and
  about 0.2 ms on the plain page. GPU main is mostly idle. Neither differs
  between long intervals and the rest.
- The 6 ms `GpuChannelHost::VerifyFlush` draws seen in base explain 3 of the
  162 late timers, not the share.
- Source:
  [cc/scheduler/scheduler.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/cc/scheduler/scheduler.cc),
  `ScheduleBeginImplFrameDeadline` and `OnBeginFrameDerivedImpl`.

Driving the wheel at 120 Hz instead of qa-editing's sleep-paced cadence
(`--hz 120`) sometimes lowers spool's share; one run reached zoom 1.4% at
dpr 2. It does not do so reliably (k = 0.45 got worse in another run), and the
plain page stays at 14–17%. More input traffic keeps the Compositor thread
awake. That fits the wake-up explanation, but it is not a fix spool can ship.

## What is left, and whose it is

The miss is Chromium on macOS, under the page: the Compositor thread's
deadline timer wakes late. Candidates to try are Chromium's timer slack, the
message pump, or the thread's QoS. All are browser flags or Chromium bugs,
not spool code. The spool-only cost the trace does show is the WebGL picture
layer's occasional `VerifyFlush` draw, and it sits inside the noise.

Reproduce (on the m1):

```
node bench/pan-trace.ts --project <subject> --k 0.85,0.45 --rounds 3 --variant base,nolive,control
node bench/pan-trace.ts --project <subject> --k 0.85 --rounds 1 --variant base,control --trace /tmp/pan-trace
node bench/pan-trace.ts --analyse /tmp/pan-trace/k0.85-control.json
```
