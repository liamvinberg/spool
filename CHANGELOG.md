# Changelog

## [0.2.0](https://github.com/liamvinberg/spool/compare/v0.1.0...v0.2.0) (2026-07-22)


### Features

* extract frame label into reusable component ([7585c6c](https://github.com/liamvinberg/spool/commit/7585c6cf1ce571b537879d88111c480205a822bd))
* the update loop — spool upgrade, daily check, toast + self-reload ([#30](https://github.com/liamvinberg/spool/issues/30)) ([f20716b](https://github.com/liamvinberg/spool/commit/f20716b29984ca0ba39e2c51bf38ecef7f536127))


### Bug fixes

* align the update loop with its contract ([cc4646b](https://github.com/liamvinberg/spool/commit/cc4646b4938a33c921a17ad4065da51b457f72f9))
* keep canvas zoom inside entered frames ([1de8ad9](https://github.com/liamvinberg/spool/commit/1de8ad94b24f3c71e26055261acfe0a4eddda7a9))
* prevent browser history swipes ([4611238](https://github.com/liamvinberg/spool/commit/46112384d06168b4bff5ce5731294549fc786ceb))
* serve the spool mark as favicon ([09c3646](https://github.com/liamvinberg/spool/commit/09c3646e93a0e8a269b0b5faf7a955477f0b9b1e))

## 0.1.0 (2026-07-22)


### Features

* agent verbs — selection, flows, shot, logs, url, skill ([1fa265d](https://github.com/liamvinberg/spool/commit/1fa265d0427f2b6cd1d972ac048968862d206001))
* busy-port serve drains the app and stands down for a sibling daemon ([a9b8873](https://github.com/liamvinberg/spool/commit/a9b8873b1673a6dacbfc839c613db97e6abeb1fc))
* canvas hands — selection, stamps, geometry, trash ([2da4c94](https://github.com/liamvinberg/spool/commit/2da4c94378ea05ff13f3da297cf998910c162b92))
* canvas spa — projection, camera, modes ([d3c8fbb](https://github.com/liamvinberg/spool/commit/d3c8fbb47c557ac4392d199f0af0937ac904e332))
* daemon and compiled frame serve ([6cd599d](https://github.com/liamvinberg/spool/commit/6cd599dc682c58770b4a213bf46ea2a7f76bf47f))
* dogfood split — checkout daemon rides its own state dir and port ([e83fae0](https://github.com/liamvinberg/spool/commit/e83fae0d881c130a8f2c64c7659bf8d72a730c57))
* enter flies the camera to fit the frame ([deae998](https://github.com/liamvinberg/spool/commit/deae998f5b443691cc7cab1287ee555e7b2c9b80))
* entered chip and walk stills — play reads as play ([d7f00fe](https://github.com/liamvinberg/spool/commit/d7f00fe93d799c51099dd72de0ba0bdd1f0cc17c))
* figma hands — frame clicks, element scope, edge resize ([33fceb2](https://github.com/liamvinberg/spool/commit/33fceb298acbc32f2134ec4e7079a3a5d1157737))
* flow arrows on canvas — links drawn, walked edges witnessed ([c2a7e35](https://github.com/liamvinberg/spool/commit/c2a7e3558a2b5bede50b7049e27aef99aa09de64))
* flow runtime, scenarios and mock ([00887ef](https://github.com/liamvinberg/spool/commit/00887ef89f93871fcb374055222c83c4d18c9e43))
* player ([dd177dc](https://github.com/liamvinberg/spool/commit/dd177dcffe4e96e6630466dfa0225dd013a063d7))
* skill text — the complete contract, final signposts and pointer ([a8ea68e](https://github.com/liamvinberg/spool/commit/a8ea68e4be8bf57c6d12463dcf7d1c3cc49d6ae4))
* snap — every landed alignment, resize edge stops ([e209445](https://github.com/liamvinberg/spool/commit/e20944517251a0adc3acffe2c1a6ab9a0783d559))
* spool autostart — launchd start-on-login, off removes ([e7ffcbe](https://github.com/liamvinberg/spool/commit/e7ffcbe97d441a3e2364ff0c4b25b69c1373f1f0))
* spool init and open ([b369479](https://github.com/liamvinberg/spool/commit/b369479d645e408b2eef21fea271452926fbd475))


### Bug fixes

* first release is 0.1.0, not release-please's 1.0.0 default ([20db23c](https://github.com/liamvinberg/spool/commit/20db23ceaeb43a9a12089e01e5bc4819eee0524c))
* fixed elements pin to the frame while it scrolls ([5f6227a](https://github.com/liamvinberg/spool/commit/5f6227a9ba8ffd03ce681bf59faba87e9baae234))
* letterbox clears the pill on fine pointers ([b6de524](https://github.com/liamvinberg/spool/commit/b6de5247c757be6a5547411f80e317491592eaa0))
* registry rejects unreadable or malformed files ([3715f57](https://github.com/liamvinberg/spool/commit/3715f57088d2154eac12bde7dcb38834e2bff634))
* review findings — poll and self-path dedupe, honest error name ([1c224c7](https://github.com/liamvinberg/spool/commit/1c224c768846cf004df4d457067f1bdd3375edef))
* review findings on frame serve ([5baf86a](https://github.com/liamvinberg/spool/commit/5baf86a04a58ebe9248c0d6bf8280bcd031daa7e))
* screens scroll like iframes, height chain in the baseline ([2a5e8c3](https://github.com/liamvinberg/spool/commit/2a5e8c380531db8b1bea5b188b96da793d47ecdd))
* shim identity rides the document hash ([96f8227](https://github.com/liamvinberg/spool/commit/96f82270bc884691221f15f662f4cc6c8a456285))


### Polish

* biome format ([253d3e7](https://github.com/liamvinberg/spool/commit/253d3e7d30ccb9fa1cdd5509d8a3b37134ebf5d4))
* dedupe realpath, prepack build, stricter flags ([f8477e7](https://github.com/liamvinberg/spool/commit/f8477e749b3c5a1eda53a2b15f3728ae8e194fc8))
* install and develop docs ([2e2178f](https://github.com/liamvinberg/spool/commit/2e2178fa354e2fdf5f2a2c7f718d595434b2c151))
* pill breadcrumb shows the stack tail ([a436711](https://github.com/liamvinberg/spool/commit/a436711764401bd4980abe66a645d29932ff8159))
