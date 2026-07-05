# git city

**Your codebase as a living cartoon city.** Folders become buildings, files become
floors, and your coding agents run the streets — climbing towers to work on files,
lighting up floors as they go, while traffic cruises and pedestrians wander below.

Built for [Claude Code](https://claude.com/claude-code): every session paints its
work onto the city in real time. Works with any repo, any agent that touches files.

## Install & run

```sh
npx gitcity              # watch the current directory
npx gitcity ~/my-repo    # watch any repo
```

The city opens at `http://localhost:4517` and builds itself floor by floor.

**License** — git city is paid software ($13, one time, personal license):

```sh
gitcity activate <YOUR-KEY>
```

Unlicensed copies show the city gate until activated. Keys at the store link shown
on the gate.

## Auto-start with Claude Code

```sh
gitcity install-hooks
```

From then on, every new Claude Code session automatically starts the city for
whatever project it's working in, and every file the agent reads or edits moves a
character through the streets in real time. `gitcity uninstall-hooks` removes it
(your settings are backed up first).

## The city

- **Buildings are folders, floors are files** — tall towers are your big modules.
  The skyline literally grows as your codebase does; new folders construct
  themselves floor by floor with dust puffs.
- **Agents are characters** — pick from 125 pixel characters (top-left badge).
  The main session walks in from the edge of town; sub-agents spawn as kids who
  run their errands and come home.
- **Six building styles** — Empire-style setback towers for your biggest folders,
  Eiffel lattices, domes, pagodas, clock towers, and classic blocks, all with
  curtain-wall glass and name banners.
- **Day & night** (☾) — sunny pastel city, or the poster-dark version with teal
  glass against a black void. Floors an agent worked on glow warm.
- **A living street level** — cars that drive around blocks with spinning tyres
  and brake lights, taxis, police cruisers with flashers, buses, pedestrians,
  swaying trees, parks with ponds.

## Controls

| do | get |
|---|---|
| drag left/right | orbit the city to any angle |
| drag up/down / scroll | pan |
| pinch / ⌘+scroll | zoom, all the way to street level |
| click an agent | chase-cam ride behind them |
| click ground while riding | hop off and stay down in the city |
| Esc / double-click | fly back to the overview |
| hover a building | glow + full folder path |

## Requirements

Node.js ≥ 18.17. macOS, Linux, or Windows. No dependencies, no accounts, no
telemetry — everything runs locally.

---

© 2026 Kushal Rao. Commercial software — see LICENSE.
