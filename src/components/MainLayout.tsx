'use client';

import { Sidebar } from './Sidebar';
import { CanvasArea } from './CanvasArea';
import { Toolbar } from './Toolbar';

export function MainLayout() {
  return (
    <div className="flex h-screen w-full bg-white dark:bg-zinc-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Toolbar />
        <CanvasArea />
      </div>
    </div>
  );
}