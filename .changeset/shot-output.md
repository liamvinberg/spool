---
"spool.page": minor
---

Breaking: `spool shot` output is easier to use. Shots are saved under the frame's own path, like `.spool/verify/shop/checkout.png` instead of `shop%2Fcheckout.png`. One frame prints the same block as several: a head line with the content's real height and its console errors, then each file with the CSS rows it shows and its pixel scale. When the content is taller or shorter than the height it was shot at, the head line says both. `--at` takes a list like `0,1500,4000` and shoots each time in one boot, saved as `checkout@1500.png`. A page folder shoots every frame in it. A failed shot always ends by naming which frames failed, and `spool logs` no longer narrates its cache.
