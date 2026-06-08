import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Tab,
  ObjectType,
  LARGE_SCHEMA_TABLE_THRESHOLD,
  COMPACT_FIELDS_THRESHOLD,
  VIEW_COMPACT_COMPLEXITY_THRESHOLD,
} from "../../data/constants";
import {
  IconEdit,
  IconMore,
  IconDeleteStroked,
  IconLock,
  IconUnlock,
} from "@douyinfe/semi-icons";
import { Popover, Tag, Button, SideSheet } from "@douyinfe/semi-ui";
import { useHover } from "usehooks-ts";
import { useLayout, useSettings, useDiagram, useSelect } from "../../hooks";
import TableInfo from "../EditorSidePanel/TablesTab/TableInfo";
import { useTranslation } from "react-i18next";
import { getCompactedTableHeight, getTableHeight } from "../../utils/utils";
import FieldRow from "./FieldRow";

function Table({
  tableData,
  registerPointerDown,
  setHoveredTable,
  handleGripField,
  setLinkingLine,
}) {
  const onPointerDown = useCallback(
    () => registerPointerDown(tableData, ObjectType.TABLE),
    [tableData, registerPointerDown],
  );
  const [hoveredField, setHoveredField] = useState(null);
  const {
    database,
    tablesCount,
    viewComplexity,
    deleteTable,
    deleteField,
    updateTable,
  } = useDiagram();
  const { layout } = useLayout();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const {
    selectedElement,
    setSelectedElement,
    bulkSelectedElements,
    setBulkSelectedElements,
  } = useSelect();

  const borderColor = useMemo(
    () => (settings.mode === "light" ? "border-zinc-300" : "border-zinc-600"),
    [settings.mode],
  );

  // L3 compaction: tables with many fields hide their rows by default to keep
  // the canvas cheap to render. Hovering or selecting the table re-expands it.
  // Relationship endpoints use the table's compacted flag (independent of
  // hover/selection) so lines don't jitter as the user mouses over.
  //
  // Two independent triggers:
  //   - per-table: this table is itself too big (> COMPACT_FIELDS_THRESHOLD)
  //   - per-view:  the whole view is too complex (sum of tables + total fields
  //                > VIEW_COMPACT_COMPLEXITY_THRESHOLD). Catches schemas made
  //                of many small tables that still saturate the canvas.
  const hoverRef = useRef(null);
  const isMouseOver = useHover(hoverRef);
  const viewWideCompact = viewComplexity > VIEW_COMPACT_COMPLEXITY_THRESHOLD;
  const autoCompacted =
    viewWideCompact || tableData.fields.length > COMPACT_FIELDS_THRESHOLD;

  const isSelected = useMemo(() => {
    return (
      (selectedElement.id == tableData.id &&
        selectedElement.element === ObjectType.TABLE) ||
      bulkSelectedElements.some(
        (e) => e.type === ObjectType.TABLE && e.id === tableData.id,
      )
    );
  }, [selectedElement, tableData, bulkSelectedElements]);

  const showFields = !autoCompacted || isMouseOver || isSelected;

  // Re-measure the table height only when one of its layout inputs actually
  // changes (fields/comment/width/showComments) — not on every render caused
  // by moving the table (x/y change). When the table is compacted (no fields
  // visible), use the cheaper header-only height.
  const fullHeight = useMemo(
    () =>
      getTableHeight(tableData, settings.tableWidth, settings.showComments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tableData.fields,
      tableData.comment,
      settings.tableWidth,
      settings.showComments,
    ],
  );
  const compactedHeight = useMemo(
    () =>
      getCompactedTableHeight(
        tableData.comment,
        settings.tableWidth,
        settings.showComments,
      ),
    [tableData.comment, settings.tableWidth, settings.showComments],
  );
  const height = showFields ? fullHeight : compactedHeight;

  // L2.E — above the threshold, drop the per-field Popover wrapper. Each row
  // becomes a plain div; the side panel still gives access to field details.
  const effectiveShowFieldSummary =
    settings.showFieldSummary && tablesCount <= LARGE_SCHEMA_TABLE_THRESHOLD;

  // Handlers handed to memoized <FieldRow>. Wrapped in useCallback so each row
  // sees the same identity across re-renders triggered by hover, allowing
  // FieldRow.memo to skip the rows whose isHovered didn't flip.
  const handleFieldEnter = useCallback(
    (index, fieldId) => {
      setHoveredField(index);
      setHoveredTable({ tableId: tableData.id, fieldId });
    },
    [tableData.id, setHoveredTable],
  );

  const handleFieldLeave = useCallback(() => {
    setHoveredField(null);
    setHoveredTable({ tableId: null, fieldId: null });
  }, [setHoveredTable]);

  const handleFieldDelete = useCallback(
    (fieldData, tid) => {
      deleteField(fieldData, tid);
    },
    [deleteField],
  );

  const handleFieldGrip = useCallback(
    (fieldId, tid, startX, startY) => {
      handleGripField();
      setLinkingLine((prev) => ({
        ...prev,
        startFieldId: fieldId,
        startTableId: tid,
        startX,
        startY,
        endX: startX,
        endY: startY,
      }));
    },
    [handleGripField, setLinkingLine],
  );

  const lockUnlockTable = (e) => {
    const locking = !tableData.locked;
    updateTable(tableData.id, { locked: locking });

    const lockTable = () => {
      setSelectedElement({
        ...selectedElement,
        element: ObjectType.NONE,
        id: -1,
        open: false,
      });
      setBulkSelectedElements((prev) =>
        prev.filter(
          (el) => el.id !== tableData.id || el.type !== ObjectType.TABLE,
        ),
      );
    };

    const unlockTable = () => {
      const elementInBulk = {
        id: tableData.id,
        type: ObjectType.TABLE,
        initialCoords: { x: tableData.x, y: tableData.y },
        currentCoords: { x: tableData.x, y: tableData.y },
      };
      if (e.ctrlKey || e.metaKey) {
        setBulkSelectedElements((prev) => [...prev, elementInBulk]);
      } else {
        setBulkSelectedElements([elementInBulk]);
      }
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.TABLE,
        id: tableData.id,
        open: false,
      }));
    };

    if (locking) {
      lockTable();
    } else {
      unlockTable();
    }
  };

  const openEditor = () => {
    if (!layout.sidebar) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.TABLE,
        id: tableData.id,
        open: true,
      }));
    } else {
      setSelectedElement((prev) => ({
        ...prev,
        currentTab: Tab.TABLES,
        element: ObjectType.TABLE,
        id: tableData.id,
        open: true,
      }));
      if (selectedElement.currentTab !== Tab.TABLES) return;
      document
        .getElementById(`scroll_table_${tableData.id}`)
        .scrollIntoView({ behavior: "smooth" });
    }
  };

  if (tableData.hidden) return null;

  const sideSheetVisible =
    selectedElement.element === ObjectType.TABLE &&
    selectedElement.id === tableData.id &&
    selectedElement.open &&
    !layout.sidebar;

  return (
    <>
      {/* The hover ref is attached to a <g> so it captures mouseenter/leave
          across the whole table; useHover drives the auto-compaction expand. */}
      <g ref={hoverRef}>
      <foreignObject
        key={tableData.id}
        x={tableData.x}
        y={tableData.y}
        width={settings.tableWidth}
        height={height}
        className="group drop-shadow-lg rounded-md cursor-move"
        onPointerDown={onPointerDown}
        // L2.G — contain layout/style/paint inside the foreignObject so
        // changes inside a table (hover, field edit) don't trigger reflow
        // calculations on sibling tables/relationships.
        style={{ contain: "layout style paint" }}
      >
        <div
          onDoubleClick={openEditor}
          className={`border-2 hover:border-dashed hover:border-blue-500
               select-none rounded-lg w-full ${
                 settings.mode === "light"
                   ? "bg-zinc-100 text-zinc-800"
                   : "bg-zinc-800 text-zinc-200"
               } ${isSelected ? "border-solid border-blue-500" : borderColor}`}
          style={{ direction: "ltr" }}
        >
          <div
            className="h-[10px] w-full rounded-t-md"
            style={{ backgroundColor: tableData.color }}
          />
          <div
            className={`border-b border-gray-400 ${
              settings.mode === "light" ? "bg-zinc-200" : "bg-zinc-900"
            } ${tableData.comment && settings.showComments ? "pb-3" : ""}`}
          >
            <div
              className={`overflow-hidden font-bold h-[40px] flex justify-between items-center`}
            >
              <div className="px-3 overflow-hidden text-ellipsis whitespace-nowrap">
                {tableData.name}
              </div>
              <div className="hidden group-hover:block">
                <div className="flex justify-end items-center mx-2 space-x-1.5">
                  <Button
                    icon={tableData.locked ? <IconLock /> : <IconUnlock />}
                    size="small"
                    theme="solid"
                    style={{
                      backgroundColor: "#2f68adb3",
                    }}
                    disabled={layout.readOnly}
                    onClick={lockUnlockTable}
                  />
                  <Button
                    icon={<IconEdit />}
                    size="small"
                    theme="solid"
                    style={{
                      backgroundColor: "#2f68adb3",
                    }}
                    onClick={openEditor}
                  />
                  <Popover
                    key={tableData.id}
                    content={
                      <div className="popover-theme">
                        <div className="mb-2">
                          <strong>{t("comment")}:</strong>{" "}
                          {tableData.comment === "" ? (
                            t("not_set")
                          ) : (
                            <div>{tableData.comment}</div>
                          )}
                        </div>
                        <div>
                          <strong
                            className={`${
                              tableData.indices.length === 0 ? "" : "block"
                            }`}
                          >
                            {t("indices")}:
                          </strong>{" "}
                          {tableData.indices.length === 0 ? (
                            t("not_set")
                          ) : (
                            <div>
                              {tableData.indices.map((index, k) => (
                                <div
                                  key={k}
                                  className={`flex items-center my-1 px-2 py-1 rounded ${
                                    settings.mode === "light"
                                      ? "bg-gray-100"
                                      : "bg-zinc-800"
                                  }`}
                                >
                                  <i className="fa-solid fa-thumbtack me-2 mt-1 text-slate-500"></i>
                                  <div>
                                    {index.fields.map((f) => (
                                      <Tag
                                        color="blue"
                                        key={f}
                                        className="me-1"
                                      >
                                        {f}
                                      </Tag>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          icon={<IconDeleteStroked />}
                          type="danger"
                          block
                          style={{ marginTop: "8px" }}
                          onClick={() => deleteTable(tableData.id)}
                          disabled={layout.readOnly}
                        >
                          {t("delete")}
                        </Button>
                      </div>
                    }
                    position="rightTop"
                    showArrow
                    trigger="click"
                    style={{ width: "200px", wordBreak: "break-word" }}
                  >
                    <Button
                      icon={<IconMore />}
                      type="tertiary"
                      size="small"
                      style={{
                        backgroundColor: "#808080b3",
                        color: "white",
                      }}
                    />
                  </Popover>
                </div>
              </div>
            </div>
            {tableData.comment && settings.showComments && (
              <div className="text-xs px-3 line-clamp-5">
                {tableData.comment}
              </div>
            )}
          </div>

          {showFields &&
            tableData.fields.map((fieldData, i) => (
              <FieldRow
                key={fieldData.id ?? i}
                fieldData={fieldData}
                index={i}
                isHovered={hoveredField === i}
                isLast={i === tableData.fields.length - 1}
                showFieldSummary={effectiveShowFieldSummary}
                showDataTypes={settings.showDataTypes}
                showComments={settings.showComments}
                readOnly={layout.readOnly}
                database={database}
                tableFields={tableData.fields}
                tableId={tableData.id}
                tableX={tableData.x}
                tableY={tableData.y}
                tableComment={tableData.comment}
                tableWidth={settings.tableWidth}
                onEnter={handleFieldEnter}
                onLeave={handleFieldLeave}
                onDelete={handleFieldDelete}
                onGripPointerDown={handleFieldGrip}
              />
            ))}
        </div>
      </foreignObject>
      </g>
      {sideSheetVisible && (
        // L2.F — mount the SideSheet (and the expensive TableInfo subtree)
        // only when this specific table is the one being edited via the
        // popup flow. Without this, every Table on the canvas keeps a
        // dormant SideSheet + TableInfo in the React tree.
        <SideSheet
          title={t("edit")}
          size="small"
          visible
          onCancel={() =>
            setSelectedElement((prev) => ({
              ...prev,
              open: !prev.open,
            }))
          }
          style={{ paddingBottom: "16px" }}
        >
          <div className="sidesheet-theme">
            <TableInfo data={tableData} />
          </div>
        </SideSheet>
      )}
    </>
  );
}

export default memo(Table, (prev, next) => {
  return (
    prev.tableData === next.tableData &&
    prev.registerPointerDown === next.registerPointerDown &&
    prev.setHoveredTable === next.setHoveredTable &&
    prev.handleGripField === next.handleGripField &&
    prev.setLinkingLine === next.setLinkingLine
  );
});
