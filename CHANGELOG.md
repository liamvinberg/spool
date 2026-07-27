# Changelog

## [0.4.0](https://github.com/liamvinberg/spool/compare/v0.3.0...v0.4.0) (2026-07-27)


### ⚠ BREAKING CHANGES

* isolate project execution from spool authority
* replace canvas modes with tools

### Features

* add annotate tool for marking canvas elements with numbered orders ([5350cf3](https://github.com/liamvinberg/spool/commit/5350cf334128075f4ca6feea072c8f060973fcde))
* add custom scrollbar styling to sidebar pages list ([3eb78b6](https://github.com/liamvinberg/spool/commit/3eb78b6a01f8dabb7e5a18ff162e6f5c65b19ed5))
* add frame clipboard writes ([00f6896](https://github.com/liamvinberg/spool/commit/00f68967c8644a47b876c3c1539bc30d933a24ae))
* add frame hover preview to canvas selection ([85b4b58](https://github.com/liamvinberg/spool/commit/85b4b581e3300c6ee7de9b33227874d8a3fcea64))
* add offline design checking ([1fc375c](https://github.com/liamvinberg/spool/commit/1fc375c3b3c0777d990f689bbc0c8ec27c884157))
* add stilled prop to frame shell for thumbnail swap during camera movement ([7acc60c](https://github.com/liamvinberg/spool/commit/7acc60c3d8e7b44162c54155e0a248f460ad7d6a))
* add the selection inspector rail ([04d461c](https://github.com/liamvinberg/spool/commit/04d461c72948b48f26b462a0ebc6e8b2ec5755ab))
* add tidy and bare keys for the menu's verbs ([8f46726](https://github.com/liamvinberg/spool/commit/8f46726fd98f449baec48f6d241c6797c17cbf39))
* address a cover as a ladder of rungs under one content hash ([2ce7ef2](https://github.com/liamvinberg/spool/commit/2ce7ef274090c0f7477b3c15845fb6dba58c995f))
* fill dark navigation targets when a canvas opens ([8dc4c50](https://github.com/liamvinberg/spool/commit/8dc4c50aff33e75df9c4fca9852353faf1c6fb05))
* make agent verification deterministic ([09e8bf3](https://github.com/liamvinberg/spool/commit/09e8bf3038e48210f64d964730f927c00668e298))
* read the entered frame in the inspector rail ([638b2b6](https://github.com/liamvinberg/spool/commit/638b2b66d9bea448f63d23231bf21a692038197b))
* remove and search projects on home ([fcdf282](https://github.com/liamvinberg/spool/commit/fcdf282ebb1c35f4e3f2a98533a274b36119a414))
* remove camera glide stilling and simplify frame lifecycle states ([84e686e](https://github.com/liamvinberg/spool/commit/84e686e7a8acb4742434fc066ab7d789545cbf37))
* remove registered projects ([f27990c](https://github.com/liamvinberg/spool/commit/f27990cf03509937d0e8f8a4862fff97b3046094))
* replace canvas modes with tools ([02de89f](https://github.com/liamvinberg/spool/commit/02de89f1bdb9cf4d0fb89d49560ad35ac2c2f238))
* replace canvas sidebar with page tree ([73e22dd](https://github.com/liamvinberg/spool/commit/73e22ddeb3c19110c978a14addbd7a25a1f895dd))
* resolve computed navigation targets by reading a rendered frame ([b10d3b6](https://github.com/liamvinberg/spool/commit/b10d3b66118b5fe97f23f4f5afe80d1c7640fcd6))
* rework the player as slate chrome and a session rail ([37ef162](https://github.com/liamvinberg/spool/commit/37ef16296f154ff47f13a08e93512e0d1503ccca))
* serve project webfonts from the daemon ([92d9813](https://github.com/liamvinberg/spool/commit/92d9813b4c169203e4f244370331cc285466e193))


### Bug fixes

* adjust scrollbar width and add fallback for non-webkit browsers ([db4e8b5](https://github.com/liamvinberg/spool/commit/db4e8b5eb09ebd7bc42c27af51644cbd913cc298))
* bound boot covers instead of storing them at full resolution ([1911b1e](https://github.com/liamvinberg/spool/commit/1911b1e3e469823353bba83e7ca203fa4f18bf0b))
* bring the player back when its inner frame reloads ([949229a](https://github.com/liamvinberg/spool/commit/949229aae93ac899306e6e68130fb53d720b5239))
* confine project file access to design ([36050bb](https://github.com/liamvinberg/spool/commit/36050bb79692a2cd2a761dbfc997fe38e1bf3374))
* derive connections from navigation sites in imported files ([de05e92](https://github.com/liamvinberg/spool/commit/de05e92d7270775449658df47a4cc1cc169101cc))
* isolate frame still rasterization ([ffad4dd](https://github.com/liamvinberg/spool/commit/ffad4ddbc32e2df2640e0ec685cb2aa2afa620b9))
* isolate project execution from spool authority ([76d98eb](https://github.com/liamvinberg/spool/commit/76d98eb8c1328dca40458fea08ff1fbceba7be5f))
* join terminal box glyphs ([38f2048](https://github.com/liamvinberg/spool/commit/38f20485d005a3b6322cc9731bf91ca824a94e6c))
* keep canvas movement free of stutter and flicker ([aab9239](https://github.com/liamvinberg/spool/commit/aab9239cea73c75eac78c212becfa94d26d49a75))
* keep page tree navigation explicit ([9c95b58](https://github.com/liamvinberg/spool/commit/9c95b58452c508f7e0478718705c0f63dae337f2))
* keep terminal screens source-fresh ([af5fbd2](https://github.com/liamvinberg/spool/commit/af5fbd226bfc6cda36326774bdf8f28d18b97740))
* keep the player playable when one frame will not compile ([89fd2b9](https://github.com/liamvinberg/spool/commit/89fd2b96e3752c73690f9a39ecbb2b035bf44c21))
* keep the player rail from growing a sideways scrollbar ([8cbee32](https://github.com/liamvinberg/spool/commit/8cbee3279b2116c6c9dc7d77b601bdf65c38e3be))
* let boot covers be cached and revalidated ([7724174](https://github.com/liamvinberg/spool/commit/772417425a72e79041b33da5d744a8d61f8a0705))
* name unresolvable navigation targets in the connections rail ([390b220](https://github.com/liamvinberg/spool/commit/390b220d33f1110eb637421da0d6495b54bc186d))
* preserve player frame geometry ([8dc5b5c](https://github.com/liamvinberg/spool/commit/8dc5b5c23fec6d7886c716a225785887e8ce86b9))
* rebuild a frame's graph when an import finds the file it names ([610d256](https://github.com/liamvinberg/spool/commit/610d256f66dd6494fcceff2f48300fe81dbe040d))
* reject spoofed canvas frame messages ([421c245](https://github.com/liamvinberg/spool/commit/421c2454246ec2ad27e11f36fece43776d4fc186))
* restore resizable page tree ([394c3d8](https://github.com/liamvinberg/spool/commit/394c3d86bf7002d6174ebf44ef1139e839632315))
* stop a browser extension's error from killing the player ([b6041d8](https://github.com/liamvinberg/spool/commit/b6041d886626fbff2a1c8198cc25766b4d530018))
* take the terminal app down with its supervisor ([b6e6438](https://github.com/liamvinberg/spool/commit/b6e64383b4c6755f2e312c66927b1fe4dadc11a7))


### Polish

* hold a document only for a frame something asks for ([aebfb83](https://github.com/liamvinberg/spool/commit/aebfb8328d85f8d1860a48a14fffa6b49fa52c3e))
* keep an errand out of the way of a boot somebody asked for ([f39a844](https://github.com/liamvinberg/spool/commit/f39a844d7693644e30ac7f4a22d751c3e811786e))
* keep the flow graph in the daemon instead of rebuilding it per read ([bc17b93](https://github.com/liamvinberg/spool/commit/bc17b9337f6d929e971d95322dfd6b9e3e872e47))
* land a walk without waiting to capture the target ([b2891d4](https://github.com/liamvinberg/spool/commit/b2891d4d726dbbf983d35cb73b2285f60c5c3152))
* open the canvas without waiting on the link graph ([fcabe9d](https://github.com/liamvinberg/spool/commit/fcabe9da4428f68f6d6d756b8b6b920e3c2d2ef7))
* send one shared-edit wake naming the frames it reaches ([23c847d](https://github.com/liamvinberg/spool/commit/23c847d546cb8cafcbcbbfce5be35f6dca48580a))
* share one flow build across the reads a burst of edits asks for ([fc42f9d](https://github.com/liamvinberg/spool/commit/fc42f9d11b5a5d76a9492f43a4694f7390327845))
* simplify temporary tool feedback ([b4ede14](https://github.com/liamvinberg/spool/commit/b4ede1464ef9902ee32d9ca2e8bdde5b95f4b0c7))
* wake only the frames a shared edit reaches ([d6a9b6c](https://github.com/liamvinberg/spool/commit/d6a9b6c9d8e47117fc0709c9f0751d2126dceddd))

## [0.3.0](https://github.com/liamvinberg/spool/compare/v0.2.0...v0.3.0) (2026-07-23)


### Features

* add frame reload action ([d5e94c7](https://github.com/liamvinberg/spool/commit/d5e94c73dd5d5474de70342beffd334e3d4743e7))
* add landing page blueprint frame with engineering drawing style ([b76df55](https://github.com/liamvinberg/spool/commit/b76df55d053a709acddf1e316b269b357d010150))
* add spatial navigation boundary constant and test ([e75c9ec](https://github.com/liamvinberg/spool/commit/e75c9ecf16adab2102eb06ec1869ebde502aa33d))
* canvas file tree — element tree sidebar with multi-element selection ([222e41f](https://github.com/liamvinberg/spool/commit/222e41fb936f8863114a88b026570ebd0eb02b55))
* export canvas frames ([3cfcd86](https://github.com/liamvinberg/spool/commit/3cfcd861542f08abf22c8334f2addf060b0bf957))
* multi-element selection with hover previews ([196101f](https://github.com/liamvinberg/spool/commit/196101f74e69319b020f4beddc26b228116efeb5))
* operate terminal frames live in player walks ([d145632](https://github.com/liamvinberg/spool/commit/d14563259c0e45f25c1a38a93919b13becaea1a0))
* operate terminal frames live in player walks ([5b74883](https://github.com/liamvinberg/spool/commit/5b748835e3435818156b7ddb6a871202e4ab713b))
* page-aware frame discovery and daemon surfaces ([c46a797](https://github.com/liamvinberg/spool/commit/c46a7970a849a47d8c78ca5bd88691493365e10d))
* pages — folders on disk, one canvas per page ([ef1cd00](https://github.com/liamvinberg/spool/commit/ef1cd0060ce63a0f4476044baad93e27ff95d9c9))
* pages sidebar, per-page canvas, portal jumps ([d452bb9](https://github.com/liamvinberg/spool/commit/d452bb99bb0d3921f4a6fa7430c5ebcffe8445b8))
* read the flow map from source ([#34](https://github.com/liamvinberg/spool/issues/34)) ([1e5efb7](https://github.com/liamvinberg/spool/commit/1e5efb7c72fc5d50cd28d37bc254e323678d54f8))
* remove editor chip from selection overlay and update terminal tests ([b829033](https://github.com/liamvinberg/spool/commit/b829033cd1b06f6303c6e64faddc0435437993f6))
* sidebar element tree with selection sync and editor jumps ([a4d7c53](https://github.com/liamvinberg/spool/commit/a4d7c532bfb0305e752a1e213b8f6e1edadf64a5))
* spatial keyboard navigation between frames ([8da1a0c](https://github.com/liamvinberg/spool/commit/8da1a0c3d3cc95d7c9dc750fa80311469769a76c))
* teach pages in the agent skill, page term in the glossary ([ad49ddd](https://github.com/liamvinberg/spool/commit/ad49dddec670249305fcd84f70e3033f8239301e))
* terminal frames — term.tsx runs live on the canvas ([#43](https://github.com/liamvinberg/spool/issues/43)) ([25f5233](https://github.com/liamvinberg/spool/commit/25f52331b2e954fb807f3840c0299f6e69efe8c3))
* undo and redo for frame move, resize and nudge ([b3801cb](https://github.com/liamvinberg/spool/commit/b3801cb28d9d2b6ac71964f66f641ef7fdfc72ef))
* update external link dialog layout and styling ([6c66174](https://github.com/liamvinberg/spool/commit/6c66174cb0870afd62e3a49187e52b0c914d5ad4))


### Bug fixes

* boundary rows select on click, the chevron alone expands ([8fe05e5](https://github.com/liamvinberg/spool/commit/8fe05e5d53853897944953de95381ecfd031dc31))
* confirm external links without leaving prototypes ([817f7a2](https://github.com/liamvinberg/spool/commit/817f7a29c6942f20a362a29596e5d396547470c5))
* confirm external links without leaving prototypes ([7d96125](https://github.com/liamvinberg/spool/commit/7d961252b343aa7c492e00766c988fda62a9d276))
* deduplicate frame arrows ([1bca8bc](https://github.com/liamvinberg/spool/commit/1bca8bc662063a5c23838fdd9a105a040d5161e0))
* deliver sigwinch so terminal resize reaches the tui ([91259fd](https://github.com/liamvinberg/spool/commit/91259fded7fcb3e19969c5ecf145ffe7876f4384))
* deliver the winch to the spawned app ([1a88d35](https://github.com/liamvinberg/spool/commit/1a88d357ef806fa640cd97611de64b17625bba03))
* exit chord works wherever focus sits ([ab1fb8e](https://github.com/liamvinberg/spool/commit/ab1fb8ece7a532926d384fa8f682f7b00d4c0cf6))
* player follows canvas geometry live ([dbb0192](https://github.com/liamvinberg/spool/commit/dbb01924b763d5c0b578e4049b38172849f4db59))
* preserve design selection on right click ([96f59da](https://github.com/liamvinberg/spool/commit/96f59da224536798e93ecf4ecc2c670e99dad66c))
* replace grace hibernation with warm pool and wake queue ([657d2c6](https://github.com/liamvinberg/spool/commit/657d2c6ceed1ddb5cd12efc742a3a78fd0b15461))
* replace grace hibernation with warm pool and wake queue ([f2a12b0](https://github.com/liamvinberg/spool/commit/f2a12b04bd1ec12f64263af940de4e7c7002744f))
* sidebar labels terminal frames term.tsx ([e83d679](https://github.com/liamvinberg/spool/commit/e83d67910f5cca762b93c4639ead92b6112bd2f6))
* spell the terminal exit chord as esc ([8cd9b07](https://github.com/liamvinberg/spool/commit/8cd9b07711fd36ec790f773d110bd96f444d57c2))
* spell the terminal exit chord as esc ([2d8fea6](https://github.com/liamvinberg/spool/commit/2d8fea6b9a28a246ffd88e61e65f948030db5bc4))
* stop daemon with open event streams ([16efbcb](https://github.com/liamvinberg/spool/commit/16efbcb1f7e4bcb122a86ad71dcb5c58e20b5f23))
* terminal cells match the emulator's real metrics ([a546e66](https://github.com/liamvinberg/spool/commit/a546e6669b27d3f0f2c78b75f30713b32a3e3870))
* terminal document follows daemon size, pins cell metrics, exits from anywhere ([2aba857](https://github.com/liamvinberg/spool/commit/2aba8577bd67ab696a2c6e4ace431b9c318240f5))
* terminal frame rows offer no element tree ([a82a9a6](https://github.com/liamvinberg/spool/commit/a82a9a60a6a629747a739c7e696870cb91d7c966))
* terminal frame rows offer no element tree ([6c4d014](https://github.com/liamvinberg/spool/commit/6c4d014c4da9583331cd9bb70377a7592cd79698))
* terminal frame stability — resize, replay, death, exit ([af75151](https://github.com/liamvinberg/spool/commit/af7515189790178a8bf24e089431e238a5368c44))
* terminal sessions own the grid size and keep a dying tui's last screen ([564cae6](https://github.com/liamvinberg/spool/commit/564cae62f9c0db7403f133460a6ef53387e5695c))


### Polish

* distinguish development favicon ([ed8b2e0](https://github.com/liamvinberg/spool/commit/ed8b2e06dc1ad9d8bc57540e810cd17594dd1f7b))

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
