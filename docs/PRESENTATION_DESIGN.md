# Game presentation

The world is the main interface. Play, inspect and return to the world should be understandable without reading a manual.

## Research and decisions

“AI slop” is an informal criticism, not a reliable test of authorship. The recurring design failures are generic page composition, repeated containers and decorative interface elements that lack a purpose. A community [pattern catalogue](https://slopfix.getbags.app/checklist) explicitly cautions that one font, gradient or component does not establish the problem. The previous presentation's large headline, slogans, statistics strip, nested panels and repeated explanatory captions were inappropriate for this game.

[Nielsen Norman Group's progressive-disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) supports showing the common actions first and exposing specialist functions when needed. [Xbox's navigation guidance](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112) calls for clear, consistent menu navigation. These principles inform the interaction changes below; they are not evidence that a particular colour palette is superior.

- The terrain fills the viewport. It is an interactive map, with pan, zoom, direct selection and an accessible plot selector.
- Amoeboids, crops, weather and government buildings reflect the current simulation. Decorative motion cannot change the rules or consume simulation randomness.
- The initial screen has no headline, promotional subtitle, statistics cards or permanently open inspector.
- A selected plot opens one panel. Residents, government, votes and federation membership are reached from that selection. The panel has a persistent close control and Escape support.
- Playback has Play, Step and Run day. Replay and longer runs are disclosed through labelled controls. Historical state is explicit and has a direct return-to-live action.
- Basic setup contains population, plots, duration and seed. Physical tuning remains in Advanced; behaviour editing is a named menu action.
- The visual vocabulary is terrain, creatures, field rows, paths and halls. Compact, solid HUD surfaces support the map. Typography and contrast serve legibility; marketing copy and ornamental headings are removed.

## Acceptance

An independent reviewer should attempt realistic newcomer tasks, not infer usability from a screenshot. The review covers starting and pausing, phase/day stepping, selecting plots and residents, finding government decisions and federation membership, replaying a moment, and editing a behaviour for a new world. Scores must cite observed evidence. A requested threshold does not justify inflating a score.

The political rules are preserved. Review also corrected two integration defects: the server now accepts valid visual-builder behaviours, and federation founding ballots clear their waiting reason when scheduled or activated. Replay controls navigate saved frames without advancing the live world.
