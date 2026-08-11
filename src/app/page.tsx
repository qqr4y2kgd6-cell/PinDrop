'use client';

import { MapProvider } from '@/context/MapContext';
import { MainLayout } from '@/components/MainLayout';

export default function Home() {
  return (
    <MapProvider>
      <MainLayout />
    </MapProvider>
  );
}