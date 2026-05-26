import { createContext, useState } from "react";
import {
  useDiagram,
  useAreas,
  useNotes,
  useTypes,
  useEnums,
  useTransform,
  useUndoRedo,
} from "../hooks";

export const ViewsContext = createContext(null);

export default function ViewsContextProvider({ children }) {
  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);

  const { tables, relationships, setTables, setRelationships } = useDiagram();
  const { areas, setAreas } = useAreas();
  const { notes, setNotes } = useNotes();
  const { types, setTypes } = useTypes();
  const { enums, setEnums } = useEnums();
  const { transform, setTransform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();

  // Captures the current context state as a view payload.
  const snapshotActive = () => ({
    tables,
    references: relationships,
    notes,
    areas,
    pan: transform.pan,
    zoom: transform.zoom,
    types,
    enums,
  });

  // Pushes a view payload into all domain contexts and resets undo/redo.
  const hydrateContexts = (view) => {
    setTables(view.tables ?? []);
    setRelationships(view.references ?? []);
    setNotes(view.notes ?? []);
    setAreas(view.areas ?? []);
    setTransform({ pan: view.pan ?? { x: 0, y: 0 }, zoom: view.zoom ?? 1 });
    setTypes(view.types ?? []);
    setEnums(view.enums ?? []);
    setUndoStack([]);
    setRedoStack([]);
  };

  // Serialize → hydrate → clear undo/redo.
  const switchView = (newId) => {
    if (newId === activeViewId) return;

    const snapshot = snapshotActive();
    setViews((prev) =>
      prev.map((v) => (v.id === activeViewId ? { ...v, ...snapshot } : v)),
    );

    const target = views.find((v) => v.id === newId);
    if (!target) return;

    hydrateContexts(target);
    setActiveViewId(newId);
  };

  // Saves current state, appends a blank view, and switches to it.
  const addView = (name = "New View") => {
    const snapshot = snapshotActive();
    const id = crypto.randomUUID();
    const newView = {
      id,
      name,
      tables: [],
      references: [],
      notes: [],
      areas: [],
      pan: { x: 0, y: 0 },
      zoom: 1,
      types: [],
      enums: [],
    };
    const updated = views.map((v) =>
      v.id === activeViewId ? { ...v, ...snapshot } : v,
    );
    setViews([...updated, newView]);
    hydrateContexts(newView);
    setActiveViewId(id);
  };

  const renameView = (id, name) => {
    setViews((prev) => prev.map((v) => (v.id === id ? { ...v, name } : v)));
  };

  // Blocks deletion when only one view remains.
  const deleteView = (id) => {
    if (views.length <= 1) return;

    const deletedIndex = views.findIndex((v) => v.id === id);
    const remaining = views.filter((v) => v.id !== id);

    if (id === activeViewId) {
      const nextIndex = deletedIndex > 0 ? deletedIndex - 1 : 0;
      hydrateContexts(remaining[nextIndex]);
      setActiveViewId(remaining[nextIndex].id);
    }

    setViews(remaining);
  };

  // Inserts a copy of the source view immediately after it.
  const duplicateView = (id, name) => {
    const snapshot = snapshotActive();
    const updated = views.map((v) =>
      v.id === activeViewId ? { ...v, ...snapshot } : v,
    );
    const source = updated.find((v) => v.id === id);
    if (!source) return;

    const newId = crypto.randomUUID();
    const copy = {
      ...source,
      id: newId,
      name: name ?? `${source.name} (copy)`,
    };
    const idx = updated.findIndex((v) => v.id === id);
    setViews([...updated.slice(0, idx + 1), copy, ...updated.slice(idx + 1)]);
  };

  return (
    <ViewsContext.Provider
      value={{
        views,
        setViews,
        activeViewId,
        setActiveViewId,
        switchView,
        addView,
        renameView,
        deleteView,
        duplicateView,
      }}
    >
      {children}
    </ViewsContext.Provider>
  );
}
