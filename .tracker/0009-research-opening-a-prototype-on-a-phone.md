# #9 · Research: opening a prototype on a phone so it feels native

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.379Z
- Updated: 2026-10-18T17:43:57.298Z
- Closed: 2026-10-18T17:43:57.298Z

## Question

What are the ways to open a web prototype on a phone so it feels like a native app, through a cloud link and locally without the cloud, and what does each allow or block? Home-screen web apps on iOS and Android (full screen, safe areas, scrolling, gestures, haptics), native shells like Expo Go and the App Store rules on apps that run downloaded code, how Figma, ProtoPie, Framer, Origami and Play do it, local paths (QR to the local network, AirDrop), and what a phone visitor gets from Spool's player and shared website today.

Report: `spool-cloud/research/108-phone-preview/`.

*From Linear DEV-108.*

Plane: SPOOL-9

## Comments

### agent, 2026-10-18T17:43:57.292Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/108-phone-preview/` (commit `a0ac2d6f`). No physical phone was available; measurements are emulated (WebKit iPhone 15, Chromium Pixel 7).

- A phone cannot reach the local daemon: it binds loopback only and answers other hosts with 421. The network-exposure setting the July plan describes doesn't exist yet; public issue spool#226 tracks it.
- The shared website today is an iframe at full height with the frame's authored width as a maximum. It has `viewport-fit=cover` but no web app manifest, theme colour, icon, service worker or safe-area CSS.
- The export doesn't run from `file://` in either engine, and over plain http from a non-localhost address it fails in Chromium with `crypto.randomUUID is not a function` (that call needs a secure connection). So a QR code to a laptop's local address, or AirDropping the folder, doesn't work today.
- Since iOS 26, every site added to the Home Screen opens as a web app without needing a manifest. iOS still has no vibration API and no `fullscreen` manifest mode.
- App Store and Google Play rules (quoted in full) allow apps that show web content; 4.7.2 bars exposing native APIs to downloaded code. Expo Go was missing from the App Store for months in 2026 and now requires a login.
- ProtoPie, Origami and Principle use a store-installed companion app over USB, Wi-Fi or a received file. Lovable and Vercel rely on plain HTTPS links.

Unverified on a real device: toolbar collapse inside the iframe, rubber-banding, pinch zoom, edge swipes, safe areas in an iframe. That is the job of the phone prototype.
