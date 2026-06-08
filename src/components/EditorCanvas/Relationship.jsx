import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Cardinality,
  ObjectType,
  Tab,
  COMPACT_FIELDS_THRESHOLD,
} from "../../data/constants";
import { calcPath } from "../../utils/calcPath";
import { useSettings, useLayout, useSelect } from "../../hooks";
import { useTranslation } from "react-i18next";
import { SideSheet } from "@douyinfe/semi-ui";
import RelationshipInfo from "../EditorSidePanel/RelationshipsTab/RelationshipInfo";

const labelFontSize = 16;

function Relationship({ data, startTable, endTable, viewWideCompact }) {
  const { settings } = useSettings();
  const { layout } = useLayout();
  const { selectedElement, setSelectedElement } = useSelect();
  const { t } = useTranslation();

  // startTable / endTable are looked up once at the Canvas level and passed in.
  // Their identity only changes when the specific table moves or its fields
  // change — not when an unrelated table moves. Combined with React.memo on
  // this component, dragging table X only re-renders the relationships that
  // actually touch X.
  const pathValues = useMemo(() => {
    if (!startTable || !endTable || startTable.hidden || endTable.hidden)
      return null;

    // A table is considered compacted on the canvas when either:
    //   - its own field count is above COMPACT_FIELDS_THRESHOLD, or
    //   - the whole view is above VIEW_COMPACT_COMPLEXITY_THRESHOLD
    //     (viewWideCompact, computed in Canvas).
    // While compacted, lines connect to the header (calcPath honors the
    // `compacted` flag) instead of a specific field. The line position stays
    // stable when the user hover-expands the table — the relation's name
    // label remains the way to identify the field involved.
    const startCompacted =
      viewWideCompact || startTable.fields.length > COMPACT_FIELDS_THRESHOLD;
    const endCompacted =
      viewWideCompact || endTable.fields.length > COMPACT_FIELDS_THRESHOLD;

    return {
      startFieldIndex: startTable.fields.findIndex(
        (f) => f.id === data.startFieldId,
      ),
      endFieldIndex: endTable.fields.findIndex((f) => f.id === data.endFieldId),
      startTable: {
        x: startTable.x,
        y: startTable.y,
        comment: startTable.comment,
        fields: startTable.fields,
        compacted: startCompacted,
      },
      endTable: {
        x: endTable.x,
        y: endTable.y,
        comment: endTable.comment,
        fields: endTable.fields,
        compacted: endCompacted,
      },
    };
  }, [startTable, endTable, data, viewWideCompact]);

  const pathRef = useRef();
  const labelRef = useRef();

  let cardinalityStart = "1";
  let cardinalityEnd = "1";

  switch (data.cardinality) {
    // the translated values are to ensure backwards compatibility
    case t(Cardinality.MANY_TO_ONE):
    case Cardinality.MANY_TO_ONE:
      cardinalityStart = data.manyLabel || "n";
      cardinalityEnd = "1";
      break;
    case t(Cardinality.ONE_TO_MANY):
    case Cardinality.ONE_TO_MANY:
      cardinalityStart = "1";
      cardinalityEnd = data.manyLabel || "n";
      break;
    case t(Cardinality.ONE_TO_ONE):
    case Cardinality.ONE_TO_ONE:
      cardinalityStart = "1";
      cardinalityEnd = "1";
      break;
    default:
      break;
  }

  let cardinalityStartX = 0;
  let cardinalityEndX = 0;
  let cardinalityStartY = 0;
  let cardinalityEndY = 0;
  let labelX = 0;
  let labelY = 0;

  let labelWidth = labelRef.current?.getBBox().width ?? 0;
  let labelHeight = labelRef.current?.getBBox().height ?? 0;

  const cardinalityOffset = 28;

  if (pathRef.current) {
    const pathLength = pathRef.current.getTotalLength();

    const labelPoint = pathRef.current.getPointAtLength(pathLength / 2);
    labelX = labelPoint.x - (labelWidth ?? 0) / 2;
    labelY = labelPoint.y + (labelHeight ?? 0) / 2;

    const point1 = pathRef.current.getPointAtLength(cardinalityOffset);
    cardinalityStartX = point1.x;
    cardinalityStartY = point1.y;
    const point2 = pathRef.current.getPointAtLength(
      pathLength - cardinalityOffset,
    );
    cardinalityEndX = point2.x;
    cardinalityEndY = point2.y;
  }

  const edit = () => {
    if (!layout.sidebar) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.RELATIONSHIP,
        id: data.id,
        open: true,
      }));
    } else {
      setSelectedElement((prev) => ({
        ...prev,
        currentTab: Tab.RELATIONSHIPS,
        element: ObjectType.RELATIONSHIP,
        id: data.id,
        open: true,
      }));
      if (selectedElement.currentTab !== Tab.RELATIONSHIPS) return;
      document
        .getElementById(`scroll_ref_${data.id}`)
        .scrollIntoView({ behavior: "smooth" });
    }
  };

  if (!pathValues) return null;

  return (
    <>
      <g className="select-none group" onDoubleClick={edit}>
        {/* invisible wider path for better hover ux */}
        <path
          d={calcPath(pathValues, settings.tableWidth, 1, settings.showComments)}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          cursor="pointer"
        />
        <path
          ref={pathRef}
          d={calcPath(pathValues, settings.tableWidth, 1, settings.showComments)}
          className="relationship-path"
          fill="none"
          cursor="pointer"
        />
        {settings.showRelationshipLabels && (
          <text
            x={labelX}
            y={labelY}
            fill={settings.mode === "dark" ? "lightgrey" : "#333"}
            fontSize={labelFontSize}
            fontWeight={500}
            ref={labelRef}
            className="group-hover:fill-sky-600"
          >
            {data.name}
          </text>
        )}
        {pathRef.current && settings.showCardinality && (
          <>
            <CardinalityLabel
              x={cardinalityStartX}
              y={cardinalityStartY}
              text={cardinalityStart}
            />
            <CardinalityLabel
              x={cardinalityEndX}
              y={cardinalityEndY}
              text={cardinalityEnd}
            />
          </>
        )}
      </g>
      <SideSheet
        title={t("edit")}
        size="small"
        visible={
          selectedElement.element === ObjectType.RELATIONSHIP &&
          selectedElement.id === data.id &&
          selectedElement.open &&
          !layout.sidebar
        }
        onCancel={() => {
          setSelectedElement((prev) => ({
            ...prev,
            open: false,
          }));
        }}
        style={{ paddingBottom: "16px" }}
      >
        <div className="sidesheet-theme">
          <RelationshipInfo data={data} />
        </div>
      </SideSheet>
    </>
  );
}

export default memo(Relationship, (prev, next) => {
  return (
    prev.data === next.data &&
    prev.startTable === next.startTable &&
    prev.endTable === next.endTable &&
    prev.viewWideCompact === next.viewWideCompact
  );
});

function CardinalityLabel({ x, y, text, r = 12, padding = 14 }) {
  const [textWidth, setTextWidth] = useState(0);
  const textRef = useRef(null);

  useEffect(() => {
    if (textRef.current) {
      const bbox = textRef.current.getBBox();
      setTextWidth(bbox.width);
    }
  }, [text]);

  return (
    <g>
      <rect
        x={x - textWidth / 2 - padding / 2}
        y={y - r}
        rx={r}
        ry={r}
        width={textWidth + padding}
        height={r * 2}
        fill="grey"
        className="group-hover:fill-sky-600"
      />
      <text
        ref={textRef}
        x={x}
        y={y}
        fill="white"
        strokeWidth="0.5"
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {text}
      </text>
    </g>
  );
}
