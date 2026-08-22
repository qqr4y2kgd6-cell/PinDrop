'use client';

import { Sidebar } from './Sidebar';
import { CanvasArea } from './CanvasArea';
import { Toolbar } from './Toolbar';
import { useState } from 'react';
import { Menu, X, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);

  return (
    <div className="flex h-screen w-full bg-white dark:bg-zinc-950 overflow-hidden">
      {/* Mobile hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-2 left-2 z-50 h-9 w-9 md:hidden bg-white/90 dark:bg-zinc-900/90 shadow-sm"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        fixed md:relative inset-y-0 left-0 z-40
        transition-transform duration-200 ease-in-out
        ${sidebarMinimized ? 'md:w-8 md:min-w-0' : 'md:w-80'}
      `}>
        {!sidebarMinimized ? (
          <Sidebar onClose={() => setSidebarOpen(false)} onMinimize={() => { setSidebarMinimized(true); setSidebarOpen(false); }} />
        ) : (
          <div className="hidden md:flex flex-col items-center pt-2 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 h-full">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarMinimized(false)} title="Show sidebar">
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Toolbar />
        <CanvasArea />
      </div>
    </div>
  );
}