# Evidence and reproduction

Captured **2026-09-05** for [the competitor study](../README.md). Only synthetic study content is included. Screenshots show the product surface, not unrelated browser tabs or original work projects. They are observations from one operator, not measured usability or performance evidence.

## Pen

| Evidence | What it records |
| --- | --- |
| [01](pen-01-fixture.png) | Initial card and reusable button study |
| [02](pen-02-text-wrap.png) | Longer text and bound spacing after the token edit |
| [03](pen-03-padding-detached.png) | Local numeric padding exception |
| [04](pen-04-script-input.png) | Script input count3 and generated Saved3 output |
| [05](pen-05-presentation.png) | Presentation surface; the tested button was unwired |
| [06](pen-06-share-snapshot.png) | Snapshot-share dialog; no share link created |
| [Study ZIP](pen-study.zip) | Saved `.pen`, script, and image together |
| [Document](pen-study.pen) | Native document, accessed through Pen/MCP only |
| [Script text](pen-runtime.js.txt) | Exact script body, including Pen's top-level return convention |
| [HTML export](pen-export.html) | Observed visual export, including resolved values and relative image |

For reproduction, extract **pen-study.zip into a new directory**, then open its `pen-study.pen` in Pen. Keep `pen-runtime.js` and `sample.png` beside it. The standalone document needs those dependencies; the script's `.txt` companion is for reading, not direct execution. The script produces native design layers and expects Pen's injected `pencil` API. It is not a standalone Node program. The document bytes were not parsed outside Pen/MCP. Save/reopen was tested in the same running app; cold restart and offline opening were not.

## Paper

| Evidence | What it records |
| --- | --- |
| [01](paper-01-fixture.png) | Initial card |
| [02](paper-02-text-wrap.png) | Long text, layout inspector and reflow |
| [03](paper-03-token-picker.png) | Token selection and Detach affordance |
| [04](paper-04-theme-and-detached-padding.png) | Theme value24 and detached horizontal padding20 |
| [05](paper-05-token-propagation.png) | Theme32 propagated to bound properties |
| [Raw JSX](paper-export.jsx.txt) | Exact exported expression; contains design divs, variable bindings and hosted image URL |
| [Raw tokens](paper-tokens.css.txt) | Final CSS token export |
| [Synthetic image](sample.png) | Small blue checker used for image import tests |

The [Paper scratch file](https://app.paper.design/file/01M1REZ9JVNPPED2C43HH299MH) retains the editable study under existing account permissions. The JSX is an expression, not a complete project. The hosted image URL is part of the observed output and may require continuing service access; `sample.png` preserves the underlying synthetic asset. Native schema export and a standalone application build were not verified.

## Figma Design

| Evidence | What it records |
| --- | --- |
| [01](figma-01-text-wrap.png) | Text Fill sizing and wrapping |
| [02](figma-02-variable.png) | Number variable spacing32 |
| [03](figma-03-token-propagation.png) | Bound padding32 in the card |
| [04](figma-04-component-propagation.png) | Inherited vertical padding20 with instance label override |
| [05](figma-05-prototype-connection.png) | Wired Reading list→Saved navigation |
| [06](figma-06-player-before.png) | Starting frame in the prototype player |
| [07](figma-07-player-after.png) | Saved message after clicking the wired button |
| [17](figma-17-override-recheck.png) | Repeated definition change after both label overrides, with instance height59 |

The [Design scratch file](https://www.figma.com/design/F4j7p43JtKbIHyBgW1cx7Z/Competitor-study-2026-09-05) retains the components and interaction. No `.fig` export was captured and no permission setting changed. Browser-native Design editing is distinct from the installed desktop app version recorded in the report.

## Figma Make

| Evidence | What it records |
| --- | --- |
| [08](figma-08-make-before.png) | Generated app with empty note/count0 |
| [09](figma-09-make-after.png) | Typed note, saved note and count1 |
| [10](figma-10-make-source.png) | React source, Button and state |
| [11](figma-11-code-edit-preview.png) | GAP32 preview with direct code change pending Save |
| [12](figma-12-make-visual-draft.png) | Font20 visual draft pending Apply |
| [13](figma-13-make-applied.png) | Version3 after agent-applied visual edit |
| [14](figma-14-make-source-diff.png) | Source view and change record |
| [15](figma-15-make-narrow.png) | App reflow at a320×700 viewport |
| [16](figma-16-make-reload.png) | Preview reload resets note/count |
| [Project ZIP](figma-make-study.zip) | Exact Download code output after Version3 |
| [App source](figma-make-App.tsx.txt) | Byte-identical `src/App.tsx` extracted from the ZIP |

The [Make scratch file](https://www.figma.com/make/kN7g9LBcSk3gK7gEIbLGpV/Minimal-Reading-List-Card) was not published. Its archive contains the generated React/Vite/Tailwind scaffold and Make-specific configuration. No downloaded scripts were executed and no external clean build was tested. The source is evidence of this generated sample, not a Spool dependency or endorsed code style. In-memory notes reset on preview reload; code changes were saved as versions.

## Evidence limits

Raw exports use `.txt` suffixes where needed to preserve their exact syntax and formatting without treating them as Spool source. ZIPs preserve executable filenames and original scaffolds. Product-generated instruction files inside the Make ZIP are artifact content, not instructions for this repository.

Native screenshots sometimes returned blank while accessibility state remained available. Paper and Figma visual records use the browser; Pen has earlier working native captures and a final reopen verified through accessibility/MCP. App/window capture, clipboard and shortcut failures are recorded as automation limitations unless separately established as product behavior. No multi-human, network-isolation, permission-change or crash-recovery experiment is represented by these files.
