'use client';

import { useMap } from '@/context/MapContext';
import { POI } from '@/types';
import { Search, Upload, Download, Plus, GripVertical, MapPin, Utensils, Landmark, Building2, TreePine, Hotel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useState, useCallback } from 'react';
import { kml } from '@tmcw/togeojson';
import { cn } from '@/lib/utils';

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'Food': Utensils,
  'Shrine/Temple': Landmark,
  'Architecture': Building2,
  'Park': TreePine,
  'Hotel': Hotel,
};

interface ParsedPOI {
  id: string;
  name: string;
  category: string;
  cityRegion: string;
  lat: number;
  lng: number;
  recommendedBy?: string;
  notes?: string;
  active: boolean;
}

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[];
  };
  properties: Record<string, unknown>;
}

function parseGeoJSON(content: string): ParsedPOI[] {
  const data = JSON.parse(content);
  if (!data.features) return [];
  return data.features.map((f: GeoJSONFeature, i: number) => ({
    id: f.properties?.id as string || `import-${i}`,
    name: f.properties?.name as string || `POI ${i + 1}`,
    category: f.properties?.category as string || 'Food',
    cityRegion: f.properties?.cityRegion as string || 'Unknown',
    lat: (f.geometry?.coordinates[1] as number) || 0,
    lng: (f.geometry?.coordinates[0] as number) || 0,
    recommendedBy: f.properties?.recommendedBy as string,
    notes: f.properties?.notes as string,
    active: true,
  }));
}

function parseCSV(content: string): ParsedPOI[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map((line, i) => {
    const values = line.split(',').map(v => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => obj[h] = values[idx]);
    return {
      id: obj.id || `import-${i}`,
      name: obj.name || `POI ${i + 1}`,
      category: obj.category || 'Food',
      cityRegion: obj.cityRegion || 'Unknown',
      lat: parseFloat(obj.lat) || 0,
      lng: parseFloat(obj.lng) || 0,
      recommendedBy: obj.recommendedBy,
      notes: obj.notes,
      active: true,
    };
  });
}

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CATEGORY_KEYWORDS: Array<{ match: RegExp; category: string }> = [
  { match: /temple|shrine|寺|神社|jinja|stupa|pagoda/i, category: 'Shrine/Temple' },
  { match: /park|garden|botanical|庭園|公園|onsen|hot.?spring/i, category: 'Park' },
  { match: /hotel|inn|hostel|ryokan|airbnb|宿泊|旅館|ホテル/i, category: 'Hotel' },
  { match: /museum|castle|tower|palace|bridge|stadium|building|architecture|城|塔|美術館|橋|建築/i, category: 'Architecture' },
  { match: /cafe|café|coffee|restaurant|ramen|sushi|bar|izakaya|bakery|diner|market|食|料理|カフェ|レストラン|ラーメン|居酒屋|寿司/i, category: 'Food' },
];

function guessCategory(text: string): string {
  for (const k of CATEGORY_KEYWORDS) {
    if (k.match.test(text)) return k.category;
  }
  return 'Food';
}

/** Converts a KML document (Google Maps export etc.) into POIs via @tmcw/togeojson. */
function parseKML(content: string): ParsedPOI[] {
  const doc = new DOMParser().parseFromString(content, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return [];
  const geojson = kml(doc, { skipNullGeometry: true });
  const pois: ParsedPOI[] = [];
  let n = 0;
  for (const feature of geojson.features ?? []) {
    const geometry = feature.geometry as { type?: string; coordinates?: unknown } | null;
    if (!geometry || (geometry.type !== 'Point' && geometry.type !== 'MultiPoint')) continue;
    const coords = geometry.coordinates as number[] | number[][];
    const [lng, lat] = Array.isArray(coords[0]) ? (coords[0] as number[]) : (coords as number[]);
    if (typeof lng !== 'number' || typeof lat !== 'number' || Number.isNaN(lng) || Number.isNaN(lat)) continue;
    const props = feature.properties ?? {};
    const name = String(props.name || props.Name || `POI ${n + 1}`);
    pois.push({
      id: `import-${n}`,
      name,
      category: String(props.category || props.Category || guessCategory(name)),
      cityRegion: String(props.cityRegion || props.region || props.city || 'Unknown'),
      lat,
      lng,
      notes: stripHtml(String(props.description || props.notes || '')).slice(0, 1000) || undefined,
      active: true,
    });
    n += 1;
  }
  return pois;
}

function parsePaste(text: string): ParsedPOI[] {
  if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : data.features?.map((f: GeoJSONFeature) => f.properties) || [];
    return arr.map((item: Record<string, unknown>, i: number) => ({
      id: item.id as string || `paste-${i}`,
      name: item.name as string || `POI ${i + 1}`,
      category: item.category as string || 'Food',
      cityRegion: item.cityRegion as string || 'Unknown',
      lat: parseFloat(item.lat as string) || 0,
      lng: parseFloat(item.lng as string) || 0,
      recommendedBy: item.recommendedBy as string,
      notes: item.notes as string,
      active: true,
    }));
  } else {
    return parseCSV(text);
  }
}

export function Sidebar() {
  const { pois, updatePoi, togglePoiActive, setPois, addPoi } = useMap();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterRecommender, setFilterRecommender] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'category' | 'region'>('number');

  const handleFilterRegionChange = (value: string | null) => setFilterRegion(value ?? 'all');
  const handleFilterCategoryChange = (value: string | null) => setFilterCategory(value ?? 'all');
  const handleFilterRecommenderChange = (value: string | null) => setFilterRecommender(value ?? 'all');
  const handleSortByChange = (value: string | null) => setSortBy((value ?? 'number') as 'number' | 'name' | 'category' | 'region');

  const regions = Array.from(new Set(pois.map(p => p.cityRegion))).sort();
  const categories = Array.from(new Set(pois.map(p => p.category))).sort();
  const recommenders = Array.from(new Set(pois.map(p => p.recommendedBy).filter(Boolean))).sort();

  const filteredPois = pois
    .filter(p => {
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !p.cityRegion.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (filterRegion !== 'all' && p.cityRegion !== filterRegion) return false;
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      if (filterRecommender !== 'all' && p.recommendedBy !== filterRecommender) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'number') return (a.customNumber || 999) - (b.customNumber || 999);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      if (sortBy === 'region') return a.cityRegion.localeCompare(b.cityRegion);
      return 0;
    });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let newPois: ParsedPOI[] = [];
        
        if (file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json')) {
          newPois = parseGeoJSON(content);
        } else if (file.name.toLowerCase().endsWith('.csv')) {
          newPois = parseCSV(content);
        } else if (file.name.toLowerCase().endsWith('.kml')) {
          newPois = parseKML(content);
        }
        
        const maxNum = Math.max(...pois.map(p => p.customNumber || 0));
        newPois = newPois.map((p, i) => ({ ...p, customNumber: maxNum + i + 1 }));
        setPois([...pois, ...newPois]);
      } catch (err) {
        console.error('Failed to parse file:', err);
      }
    };
    reader.readAsText(file);
  }, [pois, setPois]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    try {
      const newPois = parsePaste(text);
      const maxNum = Math.max(...pois.map(p => p.customNumber || 0));
      const poisWithNumbers = newPois.map((p, i) => ({ ...p, customNumber: maxNum + i + 1 }));
      setPois([...pois, ...poisWithNumbers]);
    } catch (err) {
      console.error('Failed to parse paste:', err);
    }
  }, [pois, setPois]);

  const [addPoiOpen, setAddPoiOpen] = useState(false);
  const [newPoi, setNewPoi] = useState({
    name: '',
    category: 'Food',
    cityRegion: '',
    lat: '',
    lng: '',
    recommendedBy: '',
    notes: '',
  });

  const handleAddPoi = useCallback(() => {
    if (!newPoi.name || !newPoi.cityRegion || !newPoi.lat || !newPoi.lng) return;
    addPoi({
      name: newPoi.name,
      category: newPoi.category,
      cityRegion: newPoi.cityRegion,
      lat: parseFloat(newPoi.lat),
      lng: parseFloat(newPoi.lng),
      recommendedBy: newPoi.recommendedBy || undefined,
      notes: newPoi.notes || undefined,
      active: true,
      customNumber: Math.max(...pois.map(p => p.customNumber || 0)) + 1,
    });
    setNewPoi({
      name: '',
      category: 'Food',
      cityRegion: '',
      lat: '',
      lng: '',
      recommendedBy: '',
      notes: '',
    });
    setAddPoiOpen(false);
  }, [newPoi, addPoi, pois]);

  const renumberPois = useCallback(() => {
    let num = 1;
    const updated = [...pois].sort((a, b) => (a.customNumber || 999) - (b.customNumber || 999));
    updated.forEach(p => {
      updatePoi(p.id, { customNumber: num++ });
    });
  }, [pois, updatePoi]);

  return (
    <div className="w-80 min-h-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">PinDrop</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{pois.filter(p => p.active).length} / {pois.length} active</p>
      </div>

      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => document.getElementById('file-upload')?.click()}>
          <Upload className="h-4 w-4" />
          Import File
          <input id="file-upload" type="file" className="hidden" accept=".geojson,.json,.csv,.kml" onChange={handleFileUpload} />
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => document.getElementById('paste-area')?.focus()}>
          <Download className="h-4 w-4" />
          Paste JSON/CSV
        </Button>
        <textarea
          id="paste-area"
          className="hidden"
          onPaste={handlePaste}
        />
      </div>

      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search POIs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <Select value={filterRegion} onValueChange={handleFilterRegionChange}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="All Regions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={handleFilterCategoryChange}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRecommender} onValueChange={handleFilterRecommenderChange}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="All Recommenders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Recommenders</SelectItem>
            {recommenders.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={handleSortByChange}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="region">Region</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-2">
        <Button variant="outline" size="sm" onClick={renumberPois} className="flex-1">
          <GripVertical className="h-4 w-4 mr-1" />
          Renumber
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => setAddPoiOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add POI
        </Button>
      </div>

      <Dialog open={addPoiOpen} onOpenChange={setAddPoiOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New POI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input
                value={newPoi.name}
                onChange={e => setNewPoi({ ...newPoi, name: e.target.value })}
                placeholder="e.g., Senso-ji Temple"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <Select value={newPoi.category} onValueChange={c => setNewPoi({ ...newPoi, category: c ?? 'Food' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Food">Food</SelectItem>
                  <SelectItem value="Shrine/Temple">Shrine/Temple</SelectItem>
                  <SelectItem value="Architecture">Architecture</SelectItem>
                  <SelectItem value="Park">Park</SelectItem>
                  <SelectItem value="Hotel">Hotel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City/Region</label>
              <Input
                value={newPoi.cityRegion}
                onChange={e => setNewPoi({ ...newPoi, cityRegion: e.target.value })}
                placeholder="e.g., Tokyo (Asakusa)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={newPoi.lat}
                  onChange={e => setNewPoi({ ...newPoi, lat: e.target.value })}
                  placeholder="35.7148"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={newPoi.lng}
                  onChange={e => setNewPoi({ ...newPoi, lng: e.target.value })}
                  placeholder="139.7967"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Recommended By</label>
              <Input
                value={newPoi.recommendedBy}
                onChange={e => setNewPoi({ ...newPoi, recommendedBy: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={newPoi.notes}
                onChange={e => setNewPoi({ ...newPoi, notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPoiOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPoi}>Add POI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2 space-y-1">
          {filteredPois.map((poi) => (
            <POIItem key={poi.id} poi={poi} onToggle={togglePoiActive} onUpdate={updatePoi} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function POIItem({ poi, onToggle, onUpdate }: { poi: POI; onToggle: (id: string) => void; onUpdate: (id: string, updates: Partial<POI>) => void }) {
  const Icon = categoryIcons[poi.category] || MapPin;
  const isActive = poi.active;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customNumber: String(poi.customNumber ?? ''),
    name: poi.name,
    category: poi.category,
    cityRegion: poi.cityRegion,
    lat: String(poi.lat),
    lng: String(poi.lng),
    recommendedBy: poi.recommendedBy ?? '',
    notes: poi.notes ?? '',
    active: poi.active,
  });

  const openEditor = () => {
    setForm({
      customNumber: String(poi.customNumber ?? ''),
      name: poi.name,
      category: poi.category,
      cityRegion: poi.cityRegion,
      lat: String(poi.lat),
      lng: String(poi.lng),
      recommendedBy: poi.recommendedBy ?? '',
      notes: poi.notes ?? '',
      active: poi.active,
    });
    setOpen(true);
  };

  const save = () => {
    const updates: Partial<POI> = {
      name: form.name,
      category: form.category,
      cityRegion: form.cityRegion,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      active: form.active,
    };
    updates.recommendedBy = form.recommendedBy || undefined;
    updates.notes = form.notes || undefined;
    const num = parseInt(form.customNumber, 10);
    if (!Number.isNaN(num) && num > 0) updates.customNumber = num;
    onUpdate(poi.id, updates);
    setOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer',
          isActive ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800/50 opacity-60'
        )}
        onClick={openEditor}
        title="Click to edit"
      >
        <Checkbox
          checked={isActive}
          onCheckedChange={() => onToggle(poi.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />
        <span className="w-6 text-center text-xs font-mono text-zinc-500 dark:text-zinc-400">
          {poi.customNumber}
        </span>
        <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{poi.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{poi.cityRegion}</p>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit POI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Number</label>
                <Input
                  type="number"
                  value={form.customNumber}
                  onChange={e => setForm({ ...form, customNumber: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Name</label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Senso-ji Temple"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <Select value={form.category} onValueChange={c => setForm({ ...form, category: c ?? 'Food' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Food">Food</SelectItem>
                  <SelectItem value="Shrine/Temple">Shrine/Temple</SelectItem>
                  <SelectItem value="Architecture">Architecture</SelectItem>
                  <SelectItem value="Park">Park</SelectItem>
                  <SelectItem value="Hotel">Hotel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City/Region</label>
              <Input
                value={form.cityRegion}
                onChange={e => setForm({ ...form, cityRegion: e.target.value })}
                placeholder="e.g., Tokyo (Asakusa)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.lat}
                  onChange={e => setForm({ ...form, lat: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.lng}
                  onChange={e => setForm({ ...form, lng: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Recommended By</label>
              <Input
                value={form.recommendedBy}
                onChange={e => setForm({ ...form, recommendedBy: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full p-2 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-sm"
                rows={3}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.active}
                onCheckedChange={c => setForm({ ...form, active: c ?? false })}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.cityRegion || !form.lat || !form.lng}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}