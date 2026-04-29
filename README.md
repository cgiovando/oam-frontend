# OpenAerialMap Frontend

A modern web client for discovering, browsing, and downloading open aerial imagery from the [OpenAerialMap](https://openaerialmap.org/) catalog.

**Live prototype:** https://cgiovando.github.io/oam-frontend/

> Status: Phase 1 prototype. The codebase, UX, and APIs are still in flux and not yet a drop-in replacement for the production OAM browser.

## What it does

- Renders the global OAM image footprint mosaic as vector tiles (PMTiles).
- Lists images for the current map view, fetched from the OAM STAC API.
- Lets you click a footprint to inspect metadata, preview the image, and copy a TMS URL.
- Provides quick links to open imagery in iD or JOSM, or download the source.
- Filters by date, resolution, and provider, with all view state encoded in the URL for shareable permalinks.

## Tech stack

- React 19 + TypeScript + Vite
- MapLibre GL JS with PMTiles for the global mosaic
- TanStack Query for STAC API requests
- Zustand for client state
- Tailwind CSS for styling
- `stac-ts` for STAC type definitions

## Backend services

This is a frontend-only repository. It talks to:

- STAC API: `https://api.imagery.hotosm.org/stac` (eoAPI / pgSTAC)
- TiTiler: dynamic COG tiling and thumbnails
- PMTiles: a precomputed global footprint mosaic

## Local development

```bash
cd app
npm install
npm run dev
```

Then open the URL Vite prints (typically http://localhost:5173).

Other scripts:

```bash
npm run build     # type-check and produce a production build in app/dist
npm run preview   # serve the production build locally
npm run lint      # run ESLint
```

## Deployment

The `main` branch is automatically built and deployed to GitHub Pages by `.github/workflows/deploy.yml`. The deployed site is the contents of `app/dist`.

## Project context

This rebuild is funded by a Cisco grant to HOT (Humanitarian OpenStreetMap Team) and is part of a broader effort to modernize the OAM stack on top of a STAC-based backend. It is being developed in the open in this personal repository and will eventually move to `hotosm/openaerialmap`.

Related work:

- [OpenAerialMap backend](https://github.com/hotosm/openaerialmap) - STAC API and tiling services
- [stac-map](https://github.com/developmentseed/stac-map) - reference architecture for STAC-driven map UIs

## AI-assisted development

> This project was developed with significant assistance from AI coding tools.

- **[Claude Code](https://claude.ai/claude-code)** (Anthropic) - code generation, architecture, debugging, and documentation
- **[Codex CLI](https://github.com/openai/codex)** (OpenAI) - independent code review and a parallel architecture analysis used to cross-check design decisions
- All functionality has been tested and verified to work as intended
- Features and infrastructure choices have been reviewed and approved by the maintainer

This disclosure follows emerging best practices for transparency in AI-assisted software development, and aligns with HOT's Responsible AI Guide.

## License

[AGPL-3.0](LICENSE)
