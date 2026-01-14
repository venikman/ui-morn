import type { A2UIMessage } from "@ui-morn/shared";

type A2UIComponent = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  dataBinding?: {
    path?: string;
  };
};

type DataModel = Record<string, unknown>;

export type SurfaceState = {
  surfaceId: string;
  components: Record<string, A2UIComponent>;
  dataModel: DataModel;
  ready: boolean;
};

export type A2UISurfaces = Record<string, SurfaceState>;

export const applyA2uiMessage = (
  surfaces: A2UISurfaces,
  message: A2UIMessage
): A2UISurfaces => {
  if ("beginRendering" in message) {
    const { surfaceId } = message.beginRendering;
    return updateSurface(surfaces, surfaceId, (surface) => ({
      ...surface,
      ready: true,
    }));
  }

  if ("surfaceUpdate" in message) {
    const { surfaceId, components } = message.surfaceUpdate;
    return updateSurface(surfaces, surfaceId, (surface) => {
      const updated = { ...surface.components };
      components.forEach((component) => {
        const casted = component as A2UIComponent;
        if (casted.id) {
          updated[casted.id] = casted;
        }
      });
      return {
        ...surface,
        components: updated,
      };
    });
  }

  if ("dataModelUpdate" in message) {
    const { surfaceId, entries } = message.dataModelUpdate;
    return updateSurface(surfaces, surfaceId, (surface) => {
      const nextModel = { ...surface.dataModel };
      entries.forEach((entry) => {
        const value = getEntryValue(entry as Record<string, unknown>);
        setPath(nextModel, entry.path, value);
      });
      return {
        ...surface,
        dataModel: nextModel,
      };
    });
  }

  if ("deleteSurface" in message) {
    const { surfaceId } = message.deleteSurface;
    const { [surfaceId]: _removed, ...rest } = surfaces;
    return rest;
  }

  return surfaces;
};

export const updateDataModel = (
  surfaces: A2UISurfaces,
  surfaceId: string,
  path: string,
  value: unknown
): A2UISurfaces => {
  return updateSurface(surfaces, surfaceId, (surface) => {
    const nextModel = { ...surface.dataModel };
    setPath(nextModel, path, value);
    return { ...surface, dataModel: nextModel };
  });
};

const updateSurface = (
  surfaces: A2UISurfaces,
  surfaceId: string,
  updater: (surface: SurfaceState) => SurfaceState
) => {
  const current = surfaces[surfaceId] ?? {
    surfaceId,
    components: {},
    dataModel: {},
    ready: false,
  };

  return {
    ...surfaces,
    [surfaceId]: updater(current),
  };
};

const getEntryValue = (entry: Record<string, unknown>) => {
  if ("valueString" in entry) {
    return entry.valueString;
  }
  if ("valueNumber" in entry) {
    return entry.valueNumber;
  }
  if ("valueBoolean" in entry) {
    return entry.valueBoolean;
  }
  if ("valueMap" in entry) {
    return entry.valueMap;
  }
  return null;
};

export const getPath = (model: DataModel, path?: string): unknown => {
  if (!path) {
    return undefined;
  }
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, model);
};

const setPath = (model: DataModel, path: string, value: unknown) => {
  const segments = path.split(".");
  let cursor: DataModel = model;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as DataModel;
  }
  cursor[segments[segments.length - 1]] = value;
};
