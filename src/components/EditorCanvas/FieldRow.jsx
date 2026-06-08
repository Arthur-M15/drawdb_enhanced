import { memo, useCallback } from "react";
import { Popover, Tag, Button } from "@douyinfe/semi-ui";
import { IconMinus, IconKeyStroked } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { isRtl } from "../../i18n/utils/rtl";
import i18n from "../../i18n/i18n";
import { resolveType } from "../../utils/customTypes";
import {
  getCommentHeight,
  getFieldOffsetY,
} from "../../utils/utils";
import {
  tableHeaderHeight,
  tableColorStripHeight,
} from "../../data/constants";

// Memoized row. Hover/edit of one field only re-renders that field's row,
// not all N rows of the table.
function FieldRow({
  fieldData,
  index,
  isHovered,
  isLast,
  showFieldSummary,
  showDataTypes,
  showComments,
  readOnly,
  database,
  // Used to compute the linking line start position. Passing the array (rather
  // than precomputing the offset upstream) keeps Table.jsx free of per-row
  // calculations; the cost is paid only when the user actually grabs a grip.
  tableFields,
  tableId,
  tableX,
  tableY,
  tableComment,
  tableWidth,
  onEnter,
  onLeave,
  onDelete,
  onGripPointerDown,
}) {
  const { t } = useTranslation();
  const fieldResolved = resolveType(database, fieldData.type);
  const showFieldComment = fieldData.comment && showComments;

  const handlePointerEnter = useCallback(
    (e) => {
      if (!e.isPrimary) return;
      onEnter(index, fieldData.id);
    },
    [index, fieldData.id, onEnter],
  );

  const handlePointerLeave = useCallback(
    (e) => {
      if (!e.isPrimary) return;
      onLeave();
    },
    [onLeave],
  );

  const handlePointerDown = useCallback((e) => {
    // Required for onPointerLeave to trigger when a touch pointer leaves
    // https://stackoverflow.com/a/70976017/1137077
    e.target.releasePointerCapture(e.pointerId);
  }, []);

  const handleGripPointerDown = useCallback(
    (e) => {
      if (!e.isPrimary) return;
      const fieldY =
        tableY +
        getFieldOffsetY(tableFields, index, tableWidth, showComments) +
        tableHeaderHeight +
        tableColorStripHeight +
        getCommentHeight(tableComment, tableWidth, showComments) +
        14;
      onGripPointerDown(fieldData.id, tableId, tableX + 15, fieldY);
    },
    [
      tableId,
      tableX,
      tableY,
      tableComment,
      tableWidth,
      showComments,
      tableFields,
      index,
      fieldData.id,
      onGripPointerDown,
    ],
  );

  const handleDelete = useCallback(() => {
    if (readOnly) return;
    onDelete(fieldData, tableId);
  }, [readOnly, fieldData, tableId, onDelete]);

  const row = (
    <div
      className={`${isLast ? "" : "border-b border-gray-400"} group w-full overflow-hidden`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
    >
      <div className="h-[36px] px-2 py-1 flex justify-between items-center gap-1">
        <div
          className={`${isHovered ? "text-zinc-400" : ""} flex items-center gap-2 overflow-hidden`}
        >
          <button
            className="shrink-0 w-[10px] h-[10px] bg-[#2f68adcc] rounded-full"
            onPointerDown={handleGripPointerDown}
          />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {fieldData.name}
          </span>
        </div>
        <div className="text-zinc-400">
          {isHovered ? (
            <Button
              theme="solid"
              size="small"
              style={{ backgroundColor: "#d42020b3" }}
              icon={<IconMinus />}
              disabled={readOnly}
              onClick={handleDelete}
            />
          ) : showDataTypes ? (
            <div className="flex gap-1 items-center">
              {fieldData.primary && <IconKeyStroked />}
              {!fieldData.notNull && <span className="font-mono">?</span>}
              <span
                className={
                  "font-mono " +
                  (fieldResolved.isCustom ? "" : fieldResolved.color)
                }
                style={
                  fieldResolved.isCustom
                    ? { color: fieldResolved.color }
                    : {}
                }
              >
                {fieldData.type +
                  ((fieldResolved.isSized || fieldResolved.hasPrecision) &&
                  fieldData.size &&
                  fieldData.size !== ""
                    ? `(${fieldData.size})`
                    : "")}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {showFieldComment && (
        <div className="ms-3 px-3 pb-3">
          <div
            className={`text-xs line-clamp-2 ${showComments && fieldData.comment ? "" : ""}`}
          >
            {fieldData.comment}
          </div>
        </div>
      )}
    </div>
  );

  if (!showFieldSummary) return row;

  return (
    <Popover
      content={
        <div className="popover-theme">
          <div
            className="flex justify-between items-center pb-2"
            style={{ direction: "ltr" }}
          >
            <p className="me-4 font-bold">{fieldData.name}</p>
            <p
              className={
                "ms-4 font-mono " +
                (fieldResolved.isCustom ? "" : fieldResolved.color)
              }
              style={
                fieldResolved.isCustom ? { color: fieldResolved.color } : {}
              }
            >
              {fieldData.type +
                ((fieldResolved.isSized || fieldResolved.hasPrecision) &&
                fieldData.size &&
                fieldData.size !== ""
                  ? "(" + fieldData.size + ")"
                  : "")}
            </p>
          </div>
          <hr />
          {fieldData.primary && (
            <Tag color="blue" className="me-2 my-2">
              {t("primary")}
            </Tag>
          )}
          {fieldData.unique && (
            <Tag color="amber" className="me-2 my-2">
              {t("unique")}
            </Tag>
          )}
          {fieldData.notNull && (
            <Tag color="purple" className="me-2 my-2">
              {t("not_null")}
            </Tag>
          )}
          {fieldData.increment && (
            <Tag color="green" className="me-2 my-2">
              {t("autoincrement")}
            </Tag>
          )}
          <p>
            <strong>{t("default_value")}: </strong>
            {fieldData.default === "" ? t("not_set") : fieldData.default}
          </p>
          <p className="max-w-80">
            <strong>{t("comment")}: </strong>
            {fieldData.comment === "" ? t("not_set") : fieldData.comment}
          </p>
        </div>
      }
      position="right"
      showArrow
      style={isRtl(i18n.language) ? { direction: "rtl" } : { direction: "ltr" }}
    >
      {row}
    </Popover>
  );
}

export default memo(FieldRow);
