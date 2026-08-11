'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const PRESET_COLORS = [
  '#e0563d', '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#84cc16', '#f97316',
  '#6366f1', '#000000', '#ffffff',
];

const PANEL_W = 232;
const PANEL_H = 168;

function isLight(hex: string): boolean {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return true;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/**
 * Self-contained color picker: a swatch button and an inline dropdown rendered
 * with `position: fixed` (no portal, no controlled Base UI popover). Placement
 * is computed from the swatch's rect on open and flips above/left so it always
 * stays inside the viewport. This is deliberately dependency-free to avoid the
 * open/close races of the previous popover implementation.
 */
export function ColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        const el = triggerRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const above = r.bottom + PANEL_H + 8 > window.innerHeight;
          const top = above ? r.top - PANEL_H - 8 : r.bottom + 6;
          const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_W - 8);
          setPos({ top: Math.max(8, top), left });
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Pick spot color"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'relative h-8 w-8 shrink-0 cursor-pointer rounded-md border border-zinc-300 dark:border-zinc-600',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open && 'ring-2 ring-blue-500'
        )}
        style={{ backgroundColor: color }}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="pointer-events-none absolute inset-0 rounded-md border border-black/10" />
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          data-slot="color-picker-popover"
          className="fixed z-[60] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ top: pos.top, left: pos.left, width: PANEL_W }}
        >
          <div className="grid grid-cols-6 gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                className="relative h-7 w-7 cursor-pointer rounded-md border border-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              >
                {c === color && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className={cn('h-3.5 w-3.5', isLight(c) ? 'text-black' : 'text-white')} />
                  </span>
                )}
              </button>
            ))}
          </div>

          <label className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-zinc-200 px-1.5 dark:border-zinc-700">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-9 cursor-pointer border-0 bg-transparent p-0"
            />
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{color}</span>
          </label>
        </div>
      )}
    </>
  );
}
