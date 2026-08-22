'use client';

import { useMap } from '@/context/MapContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ColorPicker } from './ColorPicker';
import { PrintLayout } from '@/types';
import { FileDown, Eye, Undo2, Redo2, ArrowUp, ArrowDown, Settings } from 'lucide-react';
import { ExportDialog } from './ExportDialog';
import { useState } from 'react';
import { LAYOUT_FONTS } from '@/lib/titleFonts';

export function Toolbar() {
  const { layout, updateLayout, pois, pages, canUndo, canRedo, undo, redo, activeViewportId, updateViewport } = useMap();
  const [exportOpen, setExportOpen] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

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
          <Dialog open={pageSettingsOpen} onOpenChange={setPageSettingsOpen}>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPageSettingsOpen(true)}>
              <Settings className="h-3.5 w-3.5 mr-1" />
              Page settings
            </Button>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Page settings</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Paper color</span>
                  <ColorPicker color={layout.paperColor ?? '#ffffff'} onChange={(c) => updateLayout({ paperColor: c })} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Spot color</span>
                  <ColorPicker color={layout.spotColor} onChange={(c) => updateLayout({ spotColor: c })} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Margins (mm)</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['top', 'right', 'bottom', 'left'] as const).map((m) => (
                      <Input
                        key={m}
                        type="number"
                        value={layout.pageMargins?.[m] ?? 10}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          updateLayout({ pageMargins: { ...(layout.pageMargins ?? { top: 10, right: 10, bottom: 10, left: 10 }), [m]: v } });
                        }}
                        className="h-7 text-xs"
                        min={0}
                        max={60}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Item spacing (mm)</span>
                  <Input
                    type="number"
                    value={layout.itemSpacing ?? 5}
                    onChange={(e) => updateLayout({ itemSpacing: parseFloat(e.target.value) || 0 })}
                    className="h-7 text-xs"
                    min={0}
                    max={20}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={layout.snapToFold !== false} onCheckedChange={(c) => updateLayout({ snapToFold: c })} />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">Snap to fold grid</span>
                </div>
                <Separator />
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Default title font</span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Font family</span>
                  <Select value={layout.titleFontFamily ?? 'Helvetica'} onValueChange={(v: string | null) => updateLayout({ titleFontFamily: v ?? undefined })}>
                    <SelectTrigger className="text-xs h-7 px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LAYOUT_FONTS.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Size (mm)</span>
                    <Input
                      type="number"
                      value={layout.titleFontSize ?? 3}
                      onChange={(e) => updateLayout({ titleFontSize: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={1}
                      max={20}
                      step={0.5}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Weight</span>
                    <Select value={layout.titleFontWeight ?? 'bold'} onValueChange={(v: string | null) => updateLayout({ titleFontWeight: (v ?? 'bold') as 'normal' | 'medium' | 'bold' })}>
                      <SelectTrigger className="text-xs h-7 px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Default title background</span>
                  <ColorPicker color={layout.defaultTitleBackgroundColor ?? layout.spotColor} onChange={(c) => updateLayout({ defaultTitleBackgroundColor: c })} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Default title text color</span>
                  <ColorPicker color={layout.defaultTitleTextColor ?? '#ffffff'} onChange={(c) => updateLayout({ defaultTitleTextColor: c })} />
                </div>
                <Separator />
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Map settings</span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Glyphs server URL</span>
                  <Input
                    value={layout.glyphsUrl ?? ''}
                    placeholder="Default (OpenFreeMap)"
                    onChange={(e) => updateLayout({ glyphsUrl: e.target.value || undefined })}
                    className="h-7 text-xs"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight">
                  For more fonts, use: tiles.openstreetmap.us/fonts/{'{fontstack}'}/{'{range}'}.pbf
                </p>
                <Separator />
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Index list defaults</span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Default columns</span>
                  <Input
                    type="number"
                    value={layout.indexColumns ?? 2}
                    onChange={(e) => updateLayout({ indexColumns: Math.max(1, Math.round(parseFloat(e.target.value) || 1)) })}
                    className="h-7 text-xs"
                    min={1}
                    max={6}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default border width (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListBorderWidth ?? 1}
                      onChange={(e) => updateLayout({ indexListBorderWidth: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      step={0.5}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default corner radius (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListCornerRadius ?? 4}
                      onChange={(e) => updateLayout({ indexListCornerRadius: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default border color</span>
                    <ColorPicker color={layout.indexListBorderColor ?? '#000000'} onChange={(c) => updateLayout({ indexListBorderColor: c })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default background</span>
                    <ColorPicker color={layout.indexListBackgroundColor ?? '#ffffff'} onChange={(c) => updateLayout({ indexListBackgroundColor: c })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default title background</span>
                    <ColorPicker color={layout.indexListTitleBackgroundColor ?? layout.defaultTitleBackgroundColor ?? layout.spotColor} onChange={(c) => updateLayout({ indexListTitleBackgroundColor: c })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default title text color</span>
                    <ColorPicker color={layout.indexListTitleTextColor ?? '#ffffff'} onChange={(c) => updateLayout({ indexListTitleTextColor: c })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Padding top (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListPaddingTop ?? layout.indexListPadding ?? 1.5}
                      onChange={(e) => updateLayout({ indexListPaddingTop: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      max={20}
                      step={0.5}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Padding right (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListPaddingRight ?? layout.indexListPadding ?? 1.5}
                      onChange={(e) => updateLayout({ indexListPaddingRight: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      max={20}
                      step={0.5}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Padding bottom (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListPaddingBottom ?? layout.indexListPadding ?? 1.5}
                      onChange={(e) => updateLayout({ indexListPaddingBottom: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      max={20}
                      step={0.5}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Padding left (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListPaddingLeft ?? layout.indexListPadding ?? 1.5}
                      onChange={(e) => updateLayout({ indexListPaddingLeft: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      max={20}
                      step={0.5}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Default line height (mm)</span>
                    <Input
                      type="number"
                      value={layout.indexListLineHeight ?? 3.6}
                      onChange={(e) => updateLayout({ indexListLineHeight: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs"
                      min={1.2}
                      max={12}
                      step={0.2}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={layout.indexListShowTitle !== false} onCheckedChange={(c) => updateLayout({ indexListShowTitle: c })} />
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">Show title bar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={layout.indexListRoundedCorners === true} onCheckedChange={(c) => updateLayout({ indexListRoundedCorners: c })} />
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">Rounded corners</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={layout.indexListShowGridRefs !== false} onCheckedChange={(c) => updateLayout({ indexListShowGridRefs: c })} />
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">Grid references</span>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
