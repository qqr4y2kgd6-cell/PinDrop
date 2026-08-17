# PinDrop

A browser-based tool for designing and exporting beautiful tourist map sheets. Drop pins, arrange map frames, add cartographic elements, and export print-ready PDFs at 300 DPI.

## Features

- **Multi-frame layouts** — Arrange multiple map viewports on A4/A3/A2 or custom-sized pages in portrait or landscape.
- **Import POIs** — Load points of interest from GeoJSON, CSV, or JSON files. Manage, search, filter, and renumber them.
- **Map styling** — Control road, building, water, park, and land colors. Switch between color, grayscale, black & white, or spot-color modes.
- **Place-name labels** — Eight tiers of labels with local and English language toggle.
- **Cartographic elements** — Real-world unit grids, bordered frames with tick marks and coordinate labels, inset locator outlines, index/legend lists, and title blocks.
- **Drag, resize, rotate** — All canvas elements support drag, resize, and snap-to-fold-grid positioning.
- **PDF export** — WYSIWYG 300 DPI output with exact mm sizing, vector overlays, crop marks, and multi-page support.
- **Fully client-side** — All state is persisted in `localStorage`. No backend required.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy

Deploy to Vercel in one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/qqr4y2kgd6-cell/PinDrop)

Or deploy manually:

```bash
npm run build
npm start
```

## Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- [MapLibre GL JS](https://maplibre.org) with OpenFreeMap vector tiles
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- [shadcn/ui](https://ui.shadcn.com) components
- [Tailwind CSS](https://tailwindcss.com)

## License

MIT
