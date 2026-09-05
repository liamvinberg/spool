# Cross-product capability and workflow comparison

As of **2026-09-05**, for [spool-cloud #58](https://github.com/liamvinberg/spool-cloud/issues/58). Read the [method](README.md#method-and-coverage) and per-product sources before generalizing these results. **O** = observed; **D** = documented; **C** = vendor claim; **U** = unverified. A cell can contain several statuses because implementation, access, and scope are different questions.

## Product and document boundaries

| Area | Pen | Paper | Figma Design | Figma Make |
| --- | --- | --- | --- | --- |
| Authoritative working object | **O/D:** `.pen` design tree with IDs, variables, references, and script nodes | **O:** editable design nodes authored from HTML; **U:** native storage schema | **O/D:** design layers, frames, component definitions/instances, variables | **O:** React/TSX project with files, editor, running preview, saved versions |
| Creation and navigation | **O:** new file, layers, components/libraries/slides, local Save As and same-session reopen | **O:** scratch file/artboard, Design/Theme/layers, background MCP access, browser reload | **O:** draft after team-project free-file limit; layer nesting, second frame, separate player | **O:** separate Make file from Design entry point; Preview/Code, file tree, Elements tree |
| Visual editing | **O:** conditional inspector, inline text, flex fill sizing, numeric padding | **O:** inline text, flex reflow, Fill/Fit, inspector values, token picker | **O:** auto layout, Fill/Hug, variable-bound padding; fixed/min/max options visible | **O:** position, dimensions, padding/margin, typography and other property groups; source navigation affordance |
| Images | **O:** relative `sample.png` fill persisted; export uses background image | **O:** local asset reference became a hosted image URL | **D:** image editing/import; **U:** attempted local file chooser did not complete | **O:** rendered SVG data-URL checker; exported source preserves it |
| Persistence | **O:** explicit save/reopen retained layout, references and script inputs | **O:** same-user browser reload retained edits and tokens | **D:** cloud save/history; **U:** durable reopen/history restore test | **O:** code Save made Version 2; visual Apply made Version 3; preview reload reset in-memory form state |
| Offline/recovery | **U:** cold offline startup, crash recovery and merge behavior | **U:** offline authoritative copy and recovery | **D:** limited offline workflow; **U:** local verification | **U:** offline service/runtime and repository recovery |

Evidence and detailed inventory: [Pen](pen.md), [Paper](paper.md), [Figma](figma.md). These reports distinguish documented control coverage from the much narrower set of executed interactions.

## Reuse and editing contracts

| Concrete operation | Pen | Paper | Figma Design | Figma Make |
| --- | --- | --- | --- | --- |
| Edit spacing once | **O:** `$spacing`16→24 propagated to bound card/artboard | **O:** token32 propagated; detached horizontal padding remained20 | **O:** Number variable24→32 updated bound horizontal padding | **O:** source constant24→32 updated preview padding |
| Make a local exception | **O:** numeric padding20 removed binding; Undo restored it | **O:** Detach then20 preserved a literal in export | **D:** override/detachment model; **U:** local variable detachment test | **O:** heading16→20 previewed as a pending visual edit |
| Change a shared button | **O:** definition padding reached instances; overridden label survived | **O:** ordinary duplicate did not inherit original padding change | **O:** definition vertical padding12→20 reached instance; Keep reading override survived | **O:** reusable Button exists in source/Elements; **U:** multi-instance propagation test |
| Discover reuse | **O:** Components and Libraries surfaces; **D/U:** cross-file documentation conflicts | **O:** Theme inventory; **D:** copied tokens do not stay linked; libraries/components have roadmap limits | **D:** libraries, variants, overrides, usage navigation; **O:** main/instance controls | **O:** component/DOM tree and Go to source; **D/U:** Make kits and repository component reuse |

The precedent for Spool is the **distinction between changing a shared definition, editing an instance, detaching a token, and editing a resolved local value**. The tested tools expose different contracts; a single numeric field can conceal materially different consequences. This is a research implication, not a recommendation to copy their interfaces. [Pen evidence](evidence/pen-03-padding-detached.png), [Paper evidence](evidence/paper-05-token-propagation.png), [Figma evidence](evidence/figma-04-component-propagation.png)

## Runtime is several separate capabilities

| Behavior | Pen | Paper | Figma Design | Figma Make |
| --- | --- | --- | --- | --- |
| Canvas reflow | **O:** narrower frame/longer text | **O:** narrower artboard/token/text edits | **O:** auto layout and wrapping | **O:** browser layout at320×700 |
| Click navigation | **O:** presentation opened; tested button unwired, so support unresolved | **U:** dedicated click-through path | **O:** wired click navigated Reading list→Saved | **D:** app navigation possible; **U:** routing test |
| Executable code | **O:** local JS generated design nodes from inputs | **D:** shaders; **U:** arbitrary authored app in canvas | **D:** simulated prototype logic; distinct from Make | **O:** React code runs in preview |
| Real form/state | **U:** arbitrary form runtime | **O:** tested imported input/handler translated away; broader paths **U** | **O:** saved message was another frame; real form not tested | **O:** textarea, count0→1, saved note; reload reset state |
| Network/live backend | **D:** script sandbox restrictions; **U:** local probe | **D:** agents can bring data into designs; continuous runtime binding **U** | **U:** direct app backend in this Design test | **D/C:** backend/connectors/local-code workflows; **U:** authenticated API or database test |
| Someone else uses it | **O:** snapshot-share dialog only; **U:** generated link | **D:** view sharing/comments; **U:** shared interactive app | **O:** own-user prototype player; **D:** sharing | **D:** publishing; **U:** published/another-user execution |

“Live” should therefore be replaced with the behavior needed: reflow, simulation, executable UI, durable state, routing, network, or multi-user use. The completed test establishes executable input/state in Make; it does not establish a production backend or persistence. [Player before](evidence/figma-06-player-before.png), [player after](evidence/figma-07-player-after.png), [Make state](evidence/figma-09-make-after.png), [Make source](evidence/figma-make-App.tsx.txt)

## Code, agents, and ownership

| Boundary | Pen | Paper | Figma |
| --- | --- | --- | --- |
| Agent writes | **O:** MCP read/mutate tree, variables, refs, scripts; failed snippet repaired via edit ID | **O:** MCP HTML/styles/text/tokens; browser edits readable back | **D:** Design MCP read/write tools, access dependent; **O:** Make agent generated and revised TSX |
| Export | **O:** HTML/CSS, resolved numeric spacing, visual divs | **O:** JSX with CSS-variable references and hosted asset URL | **O:** Make downloaded project ZIP with source; **D:** Design's separate asset/code handoff |
| Code→visual loop | **O:** script-file edit refreshed generated layers | **O:** HTML→nodes→edited JSX export | **O:** Make direct TSX edit updated running preview |
| Visual→code loop | **O:** edited design exported; existing-repo patch **U** | **O:** edited design exported; existing-repo patch **U** | **O:** Make property draft→Apply→agent→TSX diff (`text-base`→`text-xl`) |
| Lossless existing-repo round trip | **U:** generation/export do not prove it | **U:** generation/export do not prove it | **C/D:** newer Make local-code beta; **U:** access, source identity, conflicts, and bidirectional preservation |

Make's observed loop is consequential contrary evidence to treating visual edits over code as unique to Spool. Its exact semantics also matter: the visual edit preview was staged before an agent rewrote source, while direct code edits had a separate Save/Discard checkpoint. Neither result validates or invalidates Spool's proposed source-authority design by itself. [Draft](evidence/figma-12-make-visual-draft.png), [source diff](evidence/figma-14-make-source-diff.png)

## Local, cloud, collaboration, and portability

| Question | Pen | Paper | Figma |
| --- | --- | --- | --- |
| Is there an observed local file? | **Yes:** `.pen` plus relative script/image | **No native file established:** exported JSX/CSS exists locally | **Make:** downloaded code; **Design:** cloud draft in this test |
| Does local mean no cloud processing? | **No:** disclosures separately describe remote services | **No:** local MCP coexists with service storage and hosted images | **No:** cloud design/Make services; local-code beta is a distinct path |
| Human collaboration established? | **U:** installed/public claims conflict | **D:** release notes establish teams, presence, comments; **O:** only same-user sync | **D:** permissions, multiplayer, comments; **U:** actual concurrent-user test |
| Portability established? | Saved document/dependencies and HTML; full semantic migration **U** | Visual JSX/tokens; imported application semantics can be lost | Make source ZIP; external clean build and backend migration **U** |

Sources and current plan gates are in each report's delivery section. No purchasing, invitations, permission changes, or public publishing were performed. The cross-product conclusion is to evaluate storage, processing, sync, authentication, human collaboration, and delivery independently. None follows automatically from “local,” “cloud,” “HTML,” or “code.”
