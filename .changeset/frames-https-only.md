---
"spool.page": minor
---

Breaking: frames are https-only. On the canvas, in the player, in `spool shot` and `spool logs`, in covers and in exported websites, a frame can fetch, load scripts and load images only from https, `data:` and `blob:` URLs and Spool's own libraries. A frame that called a local dev server such as `http://localhost:3000`, or any plain http address on your network, is now refused, and the frame's console says which address. Fake a backend with scenarios and a mock module instead. This holds for every project, so a frame someone else wrote can't reach services on your machine or network.
