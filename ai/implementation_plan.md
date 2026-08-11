  Expanded Project Design Document: Printable Tourist Map Application

  Goal: Create a professional-grade, printable map generator for custom POI datasets (e.g., Japan trips), featuring interactive layout control, print-optimized vector maps, and
  high-resolution PDF export.

  Visual Language:
   - Print-First Aesthetic: High-contrast, minimal, and neutral color palette with a user-definable "spot color" (e.g., #FF4400) for accents.
   - Interactive Workspace: A "WYSIWYG" drag-and-drop canvas (A4/A3/A2) supporting multiple map viewports with resizing handles.
   - Minimalist Vector Map: Monochrome 2D styling optimized for high-contrast B&W printing (gray landmass, hatched water, crisp thin roads).

  Core Technical Stack:
   - Framework: Next.js (App Router), TypeScript, Tailwind CSS.
   - UI Components: Shadcn UI (Radix UI) + Lucide React icons.
   - Map Rendering: MapLibre GL JS (Vector-based, high performance) with custom print styles.
   - Interactive Layout: react-grid-layout or a custom Draggable/Resizable engine for map frames.
   - Export Engine: jsPDF or pdfmake with SVG-to-Vector rendering (300 DPI target accuracy).

  ---

  Implementation Plan (Phased)

  Phase 1: Foundation & Data Management
   1. Project Initialization: Set up Next.js, Tailwind, and Shadcn UI.
   2. Core Data Layer: Define TypeScript models (POI, MapViewport, PrintLayout) and generate the 20-location Japan mock dataset.
   3. Data Management Sidebar: 
       - POI list with category icons (Lucide) and visibility toggles.
       - Advanced filtering (Region, Category, Recommender).
       - Import Engine: GeoJSON, KML, and CSV file upload and bulk JSON/CSV paste.

  Phase 2: Map & Layout Engine
   1. Print-Optimized Map Component:
       - Custom monochrome vector style for MapLibre GL JS.
       - Custom vector markers with index numbers (spot-color badges).
       - Alphanumeric grid overlay (A-D, 1-4).
   2. Interactive Print Canvas:
       - A4/A3/A2 workspace with drag-and-drop/resizable map frames.
       - Support for multiple viewports and mini-locator (inset) map boxes.

  Phase 3: Indexing & High-Res Export
   1. Stylized Index List: Automated multi-column POI list with grid references (e.g., "12. Fushimi Inari — B3").
   2. High-Resolution Export: 
       - PDF/SVG export function with 300 DPI vector accuracy.
       - Color modes: "Pure B&W" and "Grayscale + Spot Color Accent".
       - Export preview modal with exact pixel/mm dimensions.

  ---
