I want to build a web application for creating clean, high-resolution printable tourist maps from custom location datasets (like a Japan trip with ~300 POIs).

Set up a React (Next.js App Router) + Tailwind CSS project with TypeScript.

Please define the TypeScript interfaces and initial state for:
1. `POI` (Point of Interest):
   - id: string
   - name: string
   - category: string
   - cityRegion: string
   - lat: number, lng: number
   - recommendedBy?: string
   - notes?: string
   - customNumber?: number
   - active: boolean

2. `MapViewport`:
   - id: string
   - title: string (e.g., "Tokyo Detail", "Japan Overview")
   - center: [number, number]
   - zoom: number
   - bbox?: [number, number, number, number]
   - positionOnPage: { x: number, y: number, width: number, height: number } (in mm or %)
   - showGrid: boolean

3. `PrintLayout`:
   - pageSize: 'A4' | 'A3' | 'A2' | 'Custom'
   - orientation: 'portrait' | 'landscape'
   - spotColor: string (hex code, default accent color)
   - viewports: MapViewport[]
   - showIndexList: boolean
   - indexColumns: number

Create a mock dataset of 20 Japan locations (Tokyo, Kyoto, Osaka, Kanazawa) with categories (Food, Architecture, Shrine/Temple, Park, Hotel) to test with.