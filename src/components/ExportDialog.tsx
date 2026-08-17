'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PrintPage, POI } from '@/types';
import { exportLayout, pageSizeMm } from '@/lib/exportPdf';
import { IndexListBody } from './IndexListFrame';
import { TitleBlockFrame } from './TitleBlockFrame';
import { GridOverlay } from './GridOverlay';
import { resolveIndexConfig } from '@/lib/indexStyle';
import { titleFontCss } from '@/lib/titleFonts';
import { footprintDims } from '@/lib/units';
import { insetViewports } from '@/lib/mapStyle';
import { Loader2, Download, X } from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: PrintPage[];
  pois: POI[];
  autoDownload?: boolean;
}

const PX_PER_MM = 2;

type PreviewZoom = 'fit' | 0.5 | 1;

/** Decode a `data:` URL into a Blob without fetch (Safari rejects fetch on large data: URLs). */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Safari doesn't reliably download large `data:` URLs from a programmatically
 * clicked anchor, so convert to a Blob URL first. Appending the anchor to the
 * document is also required for Safari to honor the click.
 */
function triggerDownload(dataUrl: string, fileName: string) {
  try {
    const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) {
    console.error('Download failed', e);
  }
}

export function ExportDialog({ open, onOpenChange, pages, pois, autoDownload }: ExportDialogProps) {
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<PreviewZoom>('fit');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 800, h: 600 });
  const didAutoDownload = useRef(false);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setView({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setPdfDataUrl(null);
      setImages({});
      setBusy(true);
      setError(null);
      didAutoDownload.current = false;
    }
  };

  const fileName = `pindrop-${pages.length > 1 ? `${pages.length}-pages` : pages[0]?.pageSize.toLowerCase()}.pdf`;

  useEffect(() => {
    if (!open) return;
    didAutoDownload.current = false;
    exportLayout(pages, pois)
      .then((res) => {
        setPdfDataUrl(res.pdfDataUrl);
        setImages(res.images);
        setBusy(false);
        if (autoDownload && !didAutoDownload.current) {
          didAutoDownload.current = true;
          triggerDownload(res.pdfDataUrl, fileName);
        }
      })
      .catch((e) => {
        console.error(e);
        setError('Export failed. Check your connection and try again.');
        setBusy(false);
      });
  }, [open, pages, pois, autoDownload, fileName]);

  const totalViewports = pages.reduce((n, p) => n + p.viewports.length, 0);
  const titleHmm = 7;

  const download = () => {
    if (!pdfDataUrl) return;
    triggerDownload(pdfDataUrl, fileName);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Print Preview{pages.length > 1 ? ` (${pages.length} pages)` : ''}</DialogTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-md bg-zinc-200 p-0.5" title="Preview zoom">
                {([{ id: 'fit', label: 'Fit' }, { id: 0.5, label: '50%' }, { id: 1, label: '100%' }] as const).map((z) => (
                  <button
                    key={z.label}
                    type="button"
                    onClick={() => setZoom(z.id as PreviewZoom)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      zoom === z.id ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4 mr-1" /> Close
              </Button>
              <Button size="sm" onClick={download} disabled={!pdfDataUrl}>
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto rounded-lg bg-zinc-300 p-6 flex flex-col items-center gap-8">
          {busy ? (
            <div className="flex items-center gap-3 text-zinc-700 py-20">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Rendering {totalViewports} map frame{totalViewports > 1 ? 's' : ''}…</span>
            </div>
          ) : error ? (
            <p className="text-red-600 py-20">{error}</p>
          ) : (
            pages.map((page) => {
              const [pw, ph] = pageSizeMm(page);
              const pagePxW = pw * PX_PER_MM;
              const pagePxH = ph * PX_PER_MM;
              const fitScale = Math.max(0.05, Math.min((view.w - 64) / pagePxW, (view.h - 64) / pagePxH, 2));
              const scale = zoom === 'fit' ? fitScale : zoom;
              return (
                <div key={page.id} className="shrink-0">
                  <div className="text-xs text-zinc-700 font-medium mb-1.5">{page.name}</div>
                  <div className="bg-white" style={{ width: pagePxW * scale, height: pagePxH * scale }}>
                    <div
                      className="relative bg-white"
                      style={{ width: pagePxW, height: pagePxH, transform: `scale(${scale})`, transformOrigin: 'top left', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
                    >
                      {page.viewports.map((vp) => {
                        const p = vp.positionOnPage;
                        const fp = footprintDims(vp.rotation, p.width, p.height);
                        const title = vp.showTitle !== false;
                        const titleH = titleHmm * PX_PER_MM;
                        const borderColor = vp.borderColor || '#000';
                        const bPx = (vp.borderWidth ?? 1) * PX_PER_MM;
                        const padPx = (page.itemSpacing ?? 0) * PX_PER_MM * 0.5;
                        const family = vp.titleFontFamily ?? page.titleFontFamily;
                        const fontSize = Math.max(8, (vp.titleFontSize ?? page.titleFontSize ?? 3) * PX_PER_MM);
                        const fontWeight = vp.titleFontWeight ?? page.titleFontWeight ?? 'bold';
                        const titleBackground = vp.titleBackground !== false;
                        const titleTextColor = vp.titleTextColor ?? page.defaultTitleTextColor ?? (titleBackground ? '#fff' : '#1a1a1a');
                        return (
                          <div
                            key={`${page.id}:${vp.id}`}
                            className="absolute overflow-hidden bg-white"
                            style={{
                              left: p.x * PX_PER_MM + padPx,
                              top: p.y * PX_PER_MM + padPx,
                              width: (fp.w - (page.itemSpacing ?? 0)) * PX_PER_MM,
                              height: (fp.h - (page.itemSpacing ?? 0)) * PX_PER_MM,
                              border: `${bPx}px solid ${borderColor}`,
                              borderRadius: vp.roundedCorners ? (vp.cornerRadius ?? 4) * PX_PER_MM : 0,
                            }}
                          >
                            <div
                              className="absolute flex flex-col"
                              style={{ top: bPx, left: bPx, right: bPx, bottom: bPx }}
                            >
                              {title && (
                                <div
                                  className="flex items-center px-2 uppercase tracking-widest shrink-0"
                                  style={{
                                    height: titleH,
                                    backgroundColor: titleBackground
                                      ? (vp.titleBackgroundColor || page.defaultTitleBackgroundColor || page.spotColor)
                                      : '#fafafa',
                                    color: titleTextColor,
                                    borderBottom: vp.titleBackground === false ? `1px solid ${borderColor}` : 'none',
                                    fontFamily: titleFontCss(family),
                                    fontSize,
                                    fontWeight,
                                  }}
                                >
                                  <span className="truncate">{vp.title}</span>
                                </div>
                              )}
                              <div className="relative flex-1 min-h-0">
                                {images[`${page.id}:${vp.id}`] && (
                                  <>
                                    <img
                                      src={images[`${page.id}:${vp.id}`]}
                                      alt={vp.title}
                                      className="absolute inset-0 w-full h-full"
                                    />
                                    {vp.showGrid && vp.bbox && (
                                      <GridOverlay
                                        viewport={vp}
                                        bbox={vp.bbox}
                                        rotation={vp.rotation ?? 0}
                                        insets={insetViewports(page.viewports, vp)
                                          .map((v) => ({ bbox: v.bbox!, title: v.title }))}
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {page.indexLists.map((config) => {
                        const resolved = resolveIndexConfig(config, page);
                        const p = config.position;
                        const rotation = config.rotation ?? 0;
                        const fp = footprintDims(rotation, p.width, p.height);
                        const pad = (page.itemSpacing ?? 0) / 2;
                        const contentW = Math.max(1, p.width - pad * 2);
                        const contentH = Math.max(1, p.height - pad * 2);
                        const rotTransform =
                          rotation === 0 ? undefined : `rotate(${rotation === 270 ? -90 : rotation}deg)`;
                        return (
                          <div
                            key={`${page.id}:${config.id}`}
                            className="absolute"
                            style={{
                              left: p.x * PX_PER_MM,
                              top: p.y * PX_PER_MM,
                              width: fp.w * PX_PER_MM,
                              height: fp.h * PX_PER_MM,
                            }}
                          >
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div
                                className="relative overflow-hidden flex flex-col shrink-0"
                                style={{
                                  width: contentW * PX_PER_MM,
                                  height: contentH * PX_PER_MM,
                                  transform: rotTransform,
                                  border: `${resolved.borderWidth * PX_PER_MM}px solid ${resolved.borderColor}`,
                                  borderRadius: resolved.roundedCorners ? resolved.cornerRadius * PX_PER_MM : 0,
                                  backgroundColor: resolved.backgroundColor,
                                }}
                              >
                                {resolved.showTitle && (
                                  <div
                                    className="flex items-center px-2 uppercase tracking-widest shrink-0"
                                    style={{
                                      height: titleHmm * PX_PER_MM,
                                      backgroundColor: resolved.titleBackgroundColor,
                                      color: resolved.titleTextColor,
                                      fontFamily: titleFontCss(resolved.titleFontFamily),
                                      fontSize: Math.max(8, resolved.titleFontSize * PX_PER_MM),
                                      fontWeight: resolved.titleFontWeight,
                                    }}
                                  >
                                    <span className="truncate">{resolved.title}</span>
                                  </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                  <IndexListBody layout={page} config={config} pois={pois} compact />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {page.titleBlocks.map((config) => (
                        <div
                          key={`${page.id}:${config.id}`}
                          className="absolute"
                          style={{
                            left: config.position.x * PX_PER_MM,
                            top: config.position.y * PX_PER_MM,
                            width: config.position.width * PX_PER_MM,
                            height: config.position.height * PX_PER_MM,
                          }}
                        >
                          <TitleBlockFrame
                            layout={page}
                            config={config}
                            boxPx={{ w: config.position.width * PX_PER_MM, h: config.position.height * PX_PER_MM }}
                            contentPx={{ w: config.position.width * PX_PER_MM, h: config.position.height * PX_PER_MM }}
                            isActive={false}
                            onSelect={() => {}}
                            onRemove={() => {}}
                            onRotate={() => {}}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
