'use client';

import { useMap } from '@/context/MapContext';
import { PrintMap } from './PrintMap';
import { LayoutCanvas } from './LayoutCanvas';

export function CanvasArea() {
  const {
    layout, pages, activePageId, activeViewportId, setActiveViewportId,
    updateViewport, setActivePageId, addPage, removePage, renamePage,
    updatePageViewport, addPageViewport, removePageViewport,
    addPageIndexList, updatePageIndexList, removePageIndexList,
    addPageTitleBlock, updatePageTitleBlock, removePageTitleBlock,
    activeTab,
  } = useMap();

  const handleOpenEditor = (viewportId: string) => {
    setActiveViewportId(viewportId);
  };

  if (activeTab === 'map') {
    return (
      <PrintMap
        viewport={layout.viewports.find(v => v.id === activeViewportId)}
        onViewportChange={updateViewport}
      />
    );
  }

  return (
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
  );
}
