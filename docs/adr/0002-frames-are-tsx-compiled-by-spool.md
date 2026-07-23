# Frames are TSX, compiled invisibly by spool

A frame is one default-exported TSX component; spool builds the document around it, injects tokens and fonts, ships a pinned React, and compiles at serve time. Chosen over plain HTML for componentization (edit a shared component once, every frame updates), TypeScript in frames, and agent fluency; the HTML spikes were already imitating components with string-returning functions (#16). `design/` never gets a `package.json` or a build step: "buildless" became "zero-config", and the compile plumbing (sourcemaps, error mapping, JSX location stamping) is owned forever as the accepted price.

## Consequences

A `frame.tsx` renders nothing outside spool. Non-React products get agent-carried copy-out, not direct import. Compile-time JSX stamping is what gives selection exact source locations.
