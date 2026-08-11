declare global {
  namespace maplibregl {
    interface Style {
      version: number;
      sources: Record<string, unknown>;
      layers: unknown[];
    }
    interface LngLatBounds {
      extend(coord: [number, number]): this;
    }
  }
}

export {};