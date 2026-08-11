'use client';

import { useMap } from '@/context/MapContext';
import { PrintLayout } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { IndexListBody } from './IndexListFrame';

export function IndexList({ layout }: { layout: PrintLayout }) {
  const { pois } = useMap();
  const config = layout.indexLists[0];
  if (!config) return null;

  return (
    <Card className="w-full max-w-4xl mx-auto border-zinc-200">
      <CardContent className="p-4">
        <IndexListBody layout={layout} config={config} pois={pois} />
      </CardContent>
    </Card>
  );
}
