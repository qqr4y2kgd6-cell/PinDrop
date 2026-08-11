Create a data management sidebar UI for the map generator app:

1. Import capabilities:
   - File upload handler for GeoJSON, KML, and CSV files (parse coordinates, name, category, and notes).
   - Simple bulk text input (JSON/CSV paste).

2. Filtering and Sorting Controls:
   - Filter POIs by Region/City, Category, or Recommender.
   - Search bar to highlight or filter specific POIs.
   - Bulk assign sequential numbers (1..N) based on current filter or manually re-order POIs via drag-and-drop.
   - Toggle individual POI visibility on/off.

3. Category & Icon Management:
   - Map each category to a minimalist SVG icon (using Lucide-react icons, e.g., Utensils for Food, Landmark for Shrines, Building for Architecture).
   - Display the assigned category icon and mapped number next to each POI item in the list.