import { useState, useEffect, useCallback, createContext } from "react";
import ControlPanel from "./EditorHeader/ControlPanel";
import Canvas from "./EditorCanvas/Canvas";
import { CanvasContextProvider } from "../context/CanvasContext";
import SidePanel from "./EditorSidePanel/SidePanel";
import { DB, State } from "../data/constants";
import { db } from "../data/db";
import {
  useLayout,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useAreas,
  useNotes,
  useTypes,
  useSaveState,
  useEnums,
  useViews,
} from "../hooks";
import FloatingControls from "./FloatingControls";
import TabBar from "./EditorCanvas/TabBar";
import ViewsContextProvider from "../context/ViewsContext";
import { Button, Modal, Tag } from "@douyinfe/semi-ui";
import { IconAlertTriangle } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { databases } from "../data/databases";
import { isRtl } from "../i18n/utils/rtl";
import {
  useMatch,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { get, SHARE_FILENAME } from "../api/gists";
import { nanoid } from "nanoid";
import { mergeCustomTypes } from "../utils/customTypes";

export const IdContext = createContext({
  gistId: "",
  setGistId: () => {},
  version: "",
  setVersion: () => {},
});

const SIDEPANEL_MIN_WIDTH = 384;

// Outer shell: provides ViewsContext so WorkSpaceInner can call useViews().
export default function WorkSpace() {
  return (
    <ViewsContextProvider>
      <WorkSpaceInner />
    </ViewsContextProvider>
  );
}

function WorkSpaceInner() {
  const [gistId, setGistId] = useState("");
  const [version, setVersion] = useState("");
  const [loadedFromGistId, setLoadedFromGistId] = useState("");
  const [title, setTitle] = useState("Untitled Diagram");
  const [resize, setResize] = useState(false);
  const [width, setWidth] = useState(SIDEPANEL_MIN_WIDTH);
  const [lastSaved, setLastSaved] = useState("");
  const [showSelectDbModal, setShowSelectDbModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedDb, setSelectedDb] = useState("");
  const { layout, setLayout } = useLayout();
  const { settings } = useSettings();
  const { types, setTypes } = useTypes();
  const { areas, setAreas } = useAreas();
  const { notes, setNotes } = useNotes();
  const { saveState, setSaveState } = useSaveState();
  const { transform, setTransform } = useTransform();
  const { enums, setEnums } = useEnums();
  const {
    tables,
    relationships,
    setTables,
    setRelationships,
    database,
    setDatabase,
  } = useDiagram();
  const { undoStack, redoStack, setUndoStack, setRedoStack } = useUndoRedo();
  const { views, setViews, activeViewId, setActiveViewId } = useViews();
  const { t, i18n } = useTranslation();
  let [searchParams, setSearchParams] = useSearchParams();
  const { id: loadedDiagramId } = useParams();
  const isDiagram = useMatch("/editor/diagrams/:id");
  const isTemplate = useMatch("/editor/templates/:id");

  const navigate = useNavigate();

  const handleResize = (e) => {
    if (!resize) return;
    const w = isRtl(i18n.language) ? window.innerWidth - e.clientX : e.clientX;
    if (w > SIDEPANEL_MIN_WIDTH) setWidth(w);
  };

  const save = useCallback(async () => {
    if (searchParams.has("shareId")) {
      searchParams.delete("shareId");
      setSearchParams(searchParams, { replace: true });
    }

    // Snapshot the active view from live context state (ViewsContext.views may
    // lag behind the domain contexts between tab switches and saves).
    // Types/enums are diagram-global and stored at the top level — not in views.
    const activeSnapshot = {
      tables,
      references: relationships,
      notes,
      areas,
      pan: transform.pan,
      zoom: transform.zoom,
    };

    // Guard for the first-ever save before load() has populated ViewsContext.
    let savedViews;
    let savedActiveViewId;
    if (!views.length || !activeViewId) {
      const viewId = crypto.randomUUID();
      savedActiveViewId = viewId;
      savedViews = [{ id: viewId, name: "Main", ...activeSnapshot }];
    } else {
      savedActiveViewId = activeViewId;
      savedViews = views.map((v) =>
        v.id === activeViewId ? { ...v, ...activeSnapshot } : v,
      );
    }

    const topLevelTypesEnums = {
      ...(databases[database].hasTypes && { types }),
      ...(databases[database].hasEnums && { enums }),
    };

    if (isTemplate || (!loadedDiagramId && !isTemplate && !isDiagram)) {
      const diagramId = crypto.randomUUID();
      await db.diagrams
        .add({
          diagramId,
          database: database,
          name: title,
          gistId: gistId ?? "",
          lastModified: new Date(),
          loadedFromGistId: loadedFromGistId,
          activeViewId: savedActiveViewId,
          views: savedViews,
          ...topLevelTypesEnums,
        })
        .then(() => {
          navigate(`/editor/diagrams/${diagramId}`, { replace: true });
          setSaveState(State.SAVED);
          setLastSaved(new Date().toLocaleString());
        });
    } else {
      await db.diagrams
        .where("diagramId")
        .equals(loadedDiagramId)
        .modify({
          database: database,
          name: title,
          lastModified: new Date(),
          gistId: gistId ?? "",
          loadedFromGistId: loadedFromGistId,
          activeViewId: savedActiveViewId,
          views: savedViews,
          ...topLevelTypesEnums,
        })
        .then(() => {
          setSaveState(State.SAVED);
          setLastSaved(new Date().toLocaleString());
        });
    }
  }, [
    searchParams,
    setSearchParams,
    tables,
    relationships,
    notes,
    areas,
    types,
    title,
    transform,
    setSaveState,
    database,
    enums,
    gistId,
    loadedFromGistId,
    isDiagram,
    isTemplate,
    loadedDiagramId,
    navigate,
    views,
    activeViewId,
  ]);

  const load = useCallback(async () => {
    // Builds a synthetic single-view from a flat legacy/template/gist payload.
    // Types/enums live at the diagram level — not embedded in views.
    const makeSyntheticView = (payload) => {
      const viewId = crypto.randomUUID();
      return {
        id: viewId,
        name: "Main",
        tables: payload.tables ?? [],
        references: payload.references ?? [],
        notes: payload.notes ?? [],
        areas: payload.areas ?? [],
        pan: payload.pan ?? { x: 0, y: 0 },
        zoom: payload.zoom ?? 1,
      };
    };

    // Hydrates types/enums from a top-level payload (diagram, template, gist).
    const applyTypesAndEnums = (payload, dbType) => {
      if (databases[dbType].hasTypes) {
        if (payload.types) {
          setTypes(
            payload.types.map((t) =>
              t.id
                ? t
                : {
                    ...t,
                    id: nanoid(),
                    fields: t.fields.map((f) =>
                      f.id ? f : { ...f, id: nanoid() },
                    ),
                  },
            ),
          );
        } else {
          setTypes([]);
        }
      }
      if (databases[dbType].hasEnums) {
        setEnums(
          (payload.enums ?? []).map((e) =>
            !e.id ? { ...e, id: nanoid() } : e,
          ),
        );
      }
    };

    // Hydrates domain contexts + ViewsContext from a views[] array.
    // Types/enums are NOT touched here — call applyTypesAndEnums separately.
    const applyViews = (diagramViews, diagramActiveViewId) => {
      const activeView =
        diagramViews.find((v) => v.id === diagramActiveViewId) ??
        diagramViews[0];

      setViews(diagramViews);
      setActiveViewId(activeView.id);
      setTables(activeView.tables ?? []);
      setRelationships(activeView.references ?? []);
      setNotes(activeView.notes ?? []);
      setAreas(activeView.areas ?? []);
      setTransform({
        pan: activeView.pan ?? { x: 0, y: 0 },
        zoom: activeView.zoom ?? 1,
      });
    };

    const loadLatestDiagram = async () => {
      await db.diagrams
        .orderBy("lastModified")
        .last()
        .then((diagram) => {
          if (diagram) {
            const dbType = diagram.database ?? DB.GENERIC;
            setDatabase(dbType);
            setGistId(diagram.gistId);
            setLoadedFromGistId(diagram.loadedFromGistId);
            setTitle(diagram.name);

            // Defensive fallback: migration guarantees views[], but guard anyway.
            let diagramViews = diagram.views;
            let diagramActiveViewId = diagram.activeViewId;
            if (!diagramViews || diagramViews.length === 0) {
              const v = makeSyntheticView(diagram);
              diagramViews = [v];
              diagramActiveViewId = v.id;
            }

            applyViews(diagramViews, diagramActiveViewId);
            applyTypesAndEnums(diagram, dbType);
            navigate(`/editor/diagrams/${diagram.diagramId}`, {
              replace: true,
            });
          } else {
            if (selectedDb === "") setShowSelectDbModal(true);
          }
        })
        .catch((error) => {
          console.log(error);
        });
    };

    const loadDiagram = async (id) => {
      const diagram = await db.diagrams.where("diagramId").equals(id).first();

      if (!diagram) return;

      const dbType = diagram.database ?? DB.GENERIC;
      setDatabase(dbType);
      setGistId(diagram.gistId);
      setLoadedFromGistId(diagram.loadedFromGistId);
      setTitle(diagram.name);
      setUndoStack([]);
      setRedoStack([]);

      // Defensive fallback: migration guarantees views[], but guard anyway.
      let diagramViews = diagram.views;
      let diagramActiveViewId = diagram.activeViewId;
      if (!diagramViews || diagramViews.length === 0) {
        const v = makeSyntheticView(diagram);
        diagramViews = [v];
        diagramActiveViewId = v.id;
      }

      applyViews(diagramViews, diagramActiveViewId);
      applyTypesAndEnums(diagram, dbType);
    };

    const loadTemplate = async (id) => {
      const template = await db.templates
        .where("templateId")
        .equals(id)
        .first();

      if (template) {
        const dbType = template.database ?? DB.GENERIC;
        setDatabase(dbType);
        setTitle(template.title);
        setUndoStack([]);
        setRedoStack([]);

        let viewTypes = [];
        let viewEnums = [];
        if (databases[dbType].hasTypes && template.types) {
          viewTypes = template.types.map((t) =>
            t.id
              ? t
              : {
                  ...t,
                  id: nanoid(),
                  fields: t.fields.map((f) =>
                    f.id ? f : { ...f, id: nanoid() },
                  ),
                },
          );
        }
        if (databases[dbType].hasEnums && template.enums) {
          viewEnums = template.enums.map((e) =>
            !e.id ? { ...e, id: nanoid() } : e,
          );
        }

        // Templates use subjectAreas/relationships — build a synthetic view.
        // Types/enums are diagram-global and applied separately below.
        const viewId = crypto.randomUUID();
        const syntheticView = {
          id: viewId,
          name: "Main",
          tables: template.tables ?? [],
          references: template.relationships ?? [],
          notes: template.notes ?? [],
          areas: template.subjectAreas ?? [],
          pan: { x: 0, y: 0 },
          zoom: 1,
        };

        setViews([syntheticView]);
        setActiveViewId(viewId);
        setTables(syntheticView.tables);
        setRelationships(syntheticView.references);
        setAreas(syntheticView.areas);
        setNotes(syntheticView.notes);
        setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
        setTypes(viewTypes);
        setEnums(viewEnums);
      } else {
        if (selectedDb === "") setShowSelectDbModal(true);
      }
    };

    const loadFromGist = async (shareId, diagramId = null) => {
      try {
        const { data } = await get(shareId);
        const parsedDiagram = JSON.parse(data.files[SHARE_FILENAME].content);
        const dbType = parsedDiagram.database;

        let viewTypes = [];
        let viewEnums = [];
        if (databases[dbType].hasTypes && parsedDiagram.types) {
          viewTypes = parsedDiagram.types.map((t) =>
            t.id
              ? t
              : {
                  ...t,
                  id: nanoid(),
                  fields: t.fields.map((f) =>
                    f.id ? f : { ...f, id: nanoid() },
                  ),
                },
          );
        }
        if (databases[dbType].hasEnums && parsedDiagram.enums) {
          viewEnums = parsedDiagram.enums.map((e) =>
            !e.id ? { ...e, id: nanoid() } : e,
          );
        }

        // Gists use subjectAreas/relationships — build a synthetic view.
        // Types/enums are diagram-global and applied separately below.
        const viewId = crypto.randomUUID();
        const syntheticView = {
          id: viewId,
          name: "Main",
          tables: parsedDiagram.tables ?? [],
          references: parsedDiagram.relationships ?? [],
          notes: parsedDiagram.notes ?? [],
          areas: parsedDiagram.subjectAreas ?? [],
          pan: parsedDiagram.transform?.pan ?? { x: 0, y: 0 },
          zoom: parsedDiagram.transform?.zoom ?? 1,
        };

        setUndoStack([]);
        setRedoStack([]);
        setGistId(shareId);
        setLoadedFromGistId(shareId);
        setDatabase(dbType);
        setTitle(parsedDiagram.title);
        setViews([syntheticView]);
        setActiveViewId(viewId);
        setTables(syntheticView.tables);
        setRelationships(syntheticView.references);
        setNotes(syntheticView.notes);
        setAreas(syntheticView.areas);
        setTransform({ pan: syntheticView.pan, zoom: syntheticView.zoom });
        setTypes(viewTypes);
        setEnums(viewEnums);

        if (parsedDiagram.customTypes) {
          mergeCustomTypes(parsedDiagram.customTypes);
        }
        if (diagramId) {
          navigate(`/editor/diagrams/${diagramId}`, {
            replace: true,
          });
        }
      } catch (e) {
        console.log(e);
        setSaveState(State.FAILED_TO_LOAD);
      }
    };

    const shareId = searchParams.get("shareId");
    if (shareId) {
      const existingDiagram = await db.diagrams.get({
        loadedFromGistId: shareId,
      });

      await loadFromGist(shareId, existingDiagram?.diagramId || null);
      return;
    }

    if (!loadedDiagramId) {
      await loadLatestDiagram();
      return;
    }

    if (isDiagram && loadedDiagramId) {
      await loadDiagram(loadedDiagramId);
      return;
    }

    if (isTemplate && loadedDiagramId) {
      await loadTemplate(loadedDiagramId);
      return;
    }
  }, [
    setTransform,
    setRedoStack,
    setUndoStack,
    setRelationships,
    setTables,
    setAreas,
    setNotes,
    setTypes,
    setDatabase,
    setEnums,
    selectedDb,
    setSaveState,
    searchParams,
    navigate,
    isDiagram,
    isTemplate,
    loadedDiagramId,
    setViews,
    setActiveViewId,
  ]);

  const returnToCurrentDiagram = async () => {
    await load();
    setLayout((prev) => ({ ...prev, readOnly: false }));
    setVersion(null);
  };

  useEffect(() => {
    if (
      tables?.length === 0 &&
      areas?.length === 0 &&
      notes?.length === 0 &&
      types?.length === 0
    )
      return;

    if (settings.autosave) {
      setSaveState(State.SAVING);
    }
  }, [
    undoStack,
    redoStack,
    settings.autosave,
    tables?.length,
    areas?.length,
    notes?.length,
    types?.length,
    relationships?.length,
    transform.zoom,
    title,
    gistId,
    setSaveState,
  ]);

  useEffect(() => {
    if (layout.readOnly) return;

    if (saveState !== State.SAVING) return;

    // Debounce: `save` is a useCallback whose deps include tables/relationships/
    // notes/areas/types/etc., so it gets a new identity on every keystroke,
    // re-firing this effect. Without the timeout we'd re-serialize the full
    // model (potentially MBs) on every input. Coalesce bursts into one write.
    const timeoutId = setTimeout(() => {
      save();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [saveState, layout, save]);

  useEffect(() => {
    document.title = "Editor | drawDB";

    load();
  }, [load]);

  return (
    <div className="h-full flex flex-col overflow-hidden theme">
      <IdContext.Provider value={{ gistId, setGistId, version, setVersion }}>
        <ControlPanel
          title={title}
          setTitle={setTitle}
          lastSaved={lastSaved}
          setLastSaved={setLastSaved}
        />
      </IdContext.Provider>
      <div
        className="flex h-full overflow-y-auto"
        onPointerUp={(e) => e.isPrimary && setResize(false)}
        onPointerLeave={(e) => e.isPrimary && setResize(false)}
        onPointerMove={(e) => e.isPrimary && handleResize(e)}
        onPointerDown={(e) => {
          // Required for onPointerLeave to trigger when a touch pointer leaves
          // https://stackoverflow.com/a/70976017/1137077
          e.target.releasePointerCapture(e.pointerId);
        }}
        style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      >
        {layout.sidebar && (
          <SidePanel resize={resize} setResize={setResize} width={width} />
        )}
        <div className="flex flex-col w-full h-full overflow-hidden">
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <CanvasContextProvider className="h-full w-full">
              <Canvas saveState={saveState} setSaveState={setSaveState} />
            </CanvasContextProvider>
            {version && (
              <div className="absolute right-8 top-2 space-x-2">
                <Button
                  icon={<i className="fa-solid fa-rotate-right mt-0.5"></i>}
                  onClick={() => setShowRestoreModal(true)}
                >
                  {t("restore_version")}
                </Button>
                <Button
                  type="tertiary"
                  onClick={returnToCurrentDiagram}
                  icon={<i className="bi bi-arrow-return-right mt-1"></i>}
                >
                  {t("return_to_current")}
                </Button>
              </div>
            )}
            {!(layout.sidebar || layout.toolbar || layout.header) && (
              <div className="fixed right-5 bottom-4">
                <FloatingControls />
              </div>
            )}
          </div>
          <TabBar />
        </div>
      </div>
      <Modal
        centered
        size="medium"
        closable={false}
        hasCancel={false}
        title={t("pick_db")}
        okText={t("confirm")}
        visible={showSelectDbModal}
        onOk={() => {
          if (selectedDb === "") return;
          setDatabase(selectedDb);
          setShowSelectDbModal(false);
        }}
        okButtonProps={{ disabled: selectedDb === "" }}
      >
        <div className="grid grid-cols-3 gap-4 place-content-center">
          {Object.values(databases).map((x) => (
            <div
              key={x.name}
              onClick={() => setSelectedDb(x.label)}
              className={`space-y-3 p-3 rounded-md border-2 select-none ${
                settings.mode === "dark"
                  ? "bg-zinc-700 hover:bg-zinc-600"
                  : "bg-zinc-100 hover:bg-zinc-200"
              } ${selectedDb === x.label ? "border-zinc-400" : "border-transparent"}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{x.name}</div>
                {x.beta && (
                  <Tag size="small" color="light-blue">
                    Beta
                  </Tag>
                )}
              </div>
              {x.image && (
                <img
                  src={x.image}
                  className="h-8"
                  style={{
                    filter:
                      "opacity(0.4) drop-shadow(0 0 0 white) drop-shadow(0 0 0 white)",
                  }}
                />
              )}
              <div className="text-xs">{x.description}</div>
            </div>
          ))}
        </div>
      </Modal>
      <Modal
        visible={showRestoreModal}
        centered
        closable
        onCancel={() => setShowRestoreModal(false)}
        title={
          <span className="flex items-center gap-2">
            <IconAlertTriangle className="text-amber-400" size="extra-large" />{" "}
            {t("restore_version")}
          </span>
        }
        okText={t("continue")}
        cancelText={t("cancel")}
        onOk={() => {
          setLayout((prev) => ({ ...prev, readOnly: false }));
          setShowRestoreModal(false);
          setVersion(null);
        }}
      >
        {t("restore_warning")}
      </Modal>
    </div>
  );
}
