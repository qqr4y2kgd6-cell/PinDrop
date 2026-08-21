'use client';

import { useMap } from '@/context/MapContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrintLayout } from '@/types';
import { FileDown, Eye, Undo2, Redo2, ArrowUp, ArrowDown } from 'lucide-react';
import { ExportDialog } from './ExportDialog';
import { useState } from 'react';

export function Toolbar() {
  const { layout, updateLayout, pois, pages, canUndo, canRedo, undo, redo, activeViewportId, updateViewport } = useMap();
  const [exportOpen, setExportOpen] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);

  const handlePageSizeChange = (value: PrintLayout['pageSize'] | null) => {
    if (value) updateLayout({ pageSize: value });
  };

  const handleOrientationChange = (value: PrintLayout['orientation'] | null) => {
    if (value) updateLayout({ orientation: value });
  };

  return (
    <>
      <div className="flex items-center gap-4 p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">Page</label>
          <Select value={layout.pageSize} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="text-sm h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4 (210×297mm)</SelectItem>
              <SelectItem value="A3">A3 (297×420mm)</SelectItem>
              <SelectItem value="A2">A2 (420×594mm)</SelectItem>
              <SelectItem value="Custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {layout.pageSize === 'Custom' && (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={layout.customPageSize?.width ?? 210}
                onChange={(e) =>
                  updateLayout({
                    customPageSize: { width: Math.max(50, parseFloat(e.target.value) || 50), height: layout.customPageSize?.height ?? 297 },
                  })
                }
                className="h-8 w-20 text-sm"
                min={50}
                step={5}
                aria-label="Custom page width (mm)"
              />
              <span className="text-xs text-zinc-400">×</span>
              <Input
                type="number"
                value={layout.customPageSize?.height ?? 297}
                onChange={(e) =>
                  updateLayout({
                    customPageSize: { width: layout.customPageSize?.width ?? 210, height: Math.max(50, parseFloat(e.target.value) || 50) },
                  })
                }
                className="h-8 w-20 text-sm"
                min={50}
                step={5}
                aria-label="Custom page height (mm)"
              />
              <span className="text-xs text-zinc-400">mm</span>
            </div>
          )}
          <Select value={layout.orientation} onValueChange={handleOrientationChange}>
            <SelectTrigger className="text-sm h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="h-8 w-8 p-0"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="h-8 w-8 p-0"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          {activeViewportId && (
            <>
              <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const vp = layout.viewports.find(v => v.id === activeViewportId);
                  if (vp) updateViewport(activeViewportId, { stackOrder: (vp.stackOrder ?? 0) + 1 });
                }}
                title="Bring Forward"
                className="h-8 w-8 p-0"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const vp = layout.viewports.find(v => v.id === activeViewportId);
                  if (vp) updateViewport(activeViewportId, { stackOrder: (vp.stackOrder ?? 0) - 1 });
                }}
                title="Send Backward"
                className="h-8 w-8 p-0"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </>
          )}
          <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAutoDownload(false); setExportOpen(true); }}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => { setAutoDownload(true); setExportOpen(true); }}
          >
            <FileDown className="h-4 w-4 mr-1" />
            Export PDF
          </Button>
        </div>
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        pages={pages}
        pois={pois}
        autoDownload={autoDownload}
      />
    </>
  );
}
