# Frames are TSX, compiled invisibly by spool

A frame is one default-exported TSX component; spool builds the document around it, injects tokens and fonts, ships a pinned React, and compiles at serve time. Chosen over plain HTML for componentization (edit a shared component once, every frame updates), TypeScript in frames, and agent fluency; the HTML spikes were already imitating components with string-returning functions (#16). `design/` never gets a `package.json` or a build step: "buildless" became "zero-config", and the compile plumbing (sourcemaps, error mapping, JSX location stamping) is owned forever as the accepted price.

## Consequences

A `frame.tsx` needs Spool's compilation and injected document contract. Non-React products get agent-carried copy-out, not direct import. Compile-time JSX stamping is what gives selection exact source locations.

Amended for portable website exports, and the amendment since withdrawn: `spool build` carried the compiled connected journey and its runtime into a standalone artifact until the sharing beta's exporter was retired (DEV-195). Shared pages are compiled by Spool Cloud from the project's files, so compilation remains Spool's responsibility.
