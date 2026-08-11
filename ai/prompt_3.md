Implement a specialized vector map component using MapLibre GL JS (or Mapbox GL JS):

1. Map Styling:
   - Create or load a minimalist 2D monochrome vector map style optimized for high-contrast black & white printing.
   - Features: Landmass (light gray/white), Water (solid dark gray or hatched line pattern), Roads (thin subtle lines), Buildings/Urban footprint (flat light gray tone), no default labels or clutter.

2. Custom Markers for Print:
   - Render POI markers as high-contrast circular badges containing their assigned index number.
   - Style: Solid spot-color or black background with white crisp vector typography.
   - Handle overlapping points (spiderification or dynamic leader lines when markers are close together).

3. Map Sync & Bounds:
   - Allow setting map viewport bounds programmatically based on filtered POI sets (e.g., "Fit to Tokyo POIs").
   - Display an optional alphanumeric grid overlay (A-D vertically, 1-4 horizontally) on the map bounds.