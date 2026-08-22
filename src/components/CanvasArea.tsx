'use client';

import { useMap } from '@/context/MapContext';
import { PrintMap } from './PrintMap';
import { LayoutCanvas } from './LayoutCanvas';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function CanvasArea() {
  const {
    layout, pages, activePageId, activeViewportId, setActiveViewportId,
    updateViewport, setActivePageId, addPage, removePage, renamePage,
    updatePageViewport, addPageViewport, removePageViewport,
    addPageIndexList, updatePageIndexList, removePageIndexList,
    addPageTitleBlock, updatePageTitleBlock, removePageTitleBlock,
    activeTab, setActiveTab,
  } = useMap();

  const handleOpenEditor = (viewportId: string) => {
    setActiveViewportId(viewportId);
    setActiveTab('map');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'layout' | 'map')} className="flex-1 flex flex-col">
        <TabsList className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 md:px-4 px-14">
          <TabsTrigger value="layout" className="text-xs md:text-sm px-3 md:px-4">Print Layout</TabsTrigger>
          <TabsTrigger value="map" className="text-xs md:text-sm px-3 md:px-4">Map Editor</TabsTrigger>
        </TabsList>
        <TabsContent value="layout" className="flex-1 flex flex-col overflow-hidden">
          <LayoutCanvas
            layout={layout}
            pages={pages}
            activePageId={activePageId}
            activeViewportId={activeViewportId}
            onViewportSelect={setActiveViewportId}
            onOpenEditor={handleOpenEditor}
            onSetActivePageId={setActivePageId}
            onAddPage={addPage}
            onRemovePage={removePage}
            onRenamePage={renamePage}
            onPageViewportUpdate={updatePageViewport}
            onPageViewportAdd={addPageViewport}
            onPageViewportRemove={removePageViewport}
            onPageIndexAdd={addPageIndexList}
            onPageIndexUpdate={updatePageIndexList}
            onPageIndexRemove={removePageIndexList}
            onPageTitleBlockAdd={addPageTitleBlock}
            onPageTitleBlockUpdate={updatePageTitleBlock}
            onPageTitleBlockRemove={removePageTitleBlock}
          />
        </TabsContent>
        <TabsContent value="map" className="flex-1 flex flex-col overflow-hidden">
          <PrintMap
            viewport={layout.viewports.find(v => v.id === activeViewportId)}
            onViewportChange={updateViewport}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}