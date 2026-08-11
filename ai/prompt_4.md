Build a print layout canvas UI using an interactive layout engine (like react-grid-layout or HTML5 canvas preview):

1. Page Setup:
   - Select paper dimensions (A4, A3, A2) in both Portrait and Landscape.
   - Render exact print margins, crop marks, and optional fold guides.

2. Multi-Map Layout Builder:
   - Allow adding multiple Map Viewports onto the page sheet (e.g., one large frame for the overview map, smaller frame boxes for detail city maps).
   - Implement drag-and-drop and resizable handles for each map frame and index text box.
   - Add a mini-locator (inset map indicator): drawn bounding boxes on the main map frame showing where detail map frames are located.

3. Stylized Index List Render:
   - Render multi-column list views of the POIs sorted by number or category.
   - Layout matching the graphic design reference: Category header -> Numbered POI list -> Matching Icon -> Optional Grid Reference (e.g., "12. Fushimi Inari — B3").
   - Ensure list styling uses clean architectural grid alignment and sharp typography.