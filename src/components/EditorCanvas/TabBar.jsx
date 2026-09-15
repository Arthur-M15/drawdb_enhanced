import { useState } from "react";
import { Dropdown, Input } from "@douyinfe/semi-ui";
import { IconPlus } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { isRtl } from "../../i18n/utils/rtl";
import i18n from "../../i18n/i18n";
import { useViews } from "../../hooks";

export default function TabBar() {
  const { views, activeViewId, switchView, addView, renameView, deleteView, duplicateView } =
    useViews();
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const { t } = useTranslation();
  const rtl = isRtl(i18n.language);

  if (!views || views.length === 0) return null;

  const startRename = (view) => {
    setEditingId(view.id);
    setEditingName(view.name);
  };

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      renameView(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div
      className="flex items-stretch border-t border-color toolbar-theme shrink-0"
      style={{ direction: rtl ? "rtl" : "ltr", minHeight: "36px" }}
    >
      <div className="flex items-stretch overflow-x-auto min-w-0 flex-1">
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          const isEditing = editingId === view.id;

          return (
            <Dropdown
              key={view.id}
              trigger="contextMenu"
              position="bottomLeft"
              style={{ direction: rtl ? "rtl" : "ltr" }}
              render={
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => startRename(view)}>
                    {t("rename_view")}
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => duplicateView(view.id)}>
                    {t("duplicate_view")}
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    disabled={views.length <= 1}
                    type="danger"
                    onClick={() => deleteView(view.id)}
                  >
                    {t("delete_view")}
                  </Dropdown.Item>
                </Dropdown.Menu>
              }
            >
              <div
                className={`flex items-center px-3 select-none cursor-pointer border-r border-color whitespace-nowrap${isActive ? " bg-semi-grey-2" : " hover-1"}`}
                style={{
                  borderBottom: isActive
                    ? "2px solid var(--semi-color-primary)"
                    : "2px solid transparent",
                }}
                onClick={() => !isEditing && switchView(view.id)}
                onDoubleClick={() => startRename(view)}
              >
                {isEditing ? (
                  <span onClick={(event) => event.stopPropagation()}>
                    <Input
                      autoFocus
                      size="small"
                      value={editingName}
                      style={{ width: "120px" }}
                      onChange={(value) => setEditingName(value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") cancelRename();
                      }}
                    />
                  </span>
                ) : (
                  <span className="text-sm text-color">{view.name}</span>
                )}
              </div>
            </Dropdown>
          );
        })}
        <div
          className="px-2 flex items-center justify-center hover-1 cursor-pointer shrink-0"
          title={t("add_view")}
          onClick={() => addView(t("new_view"))}
        >
          <IconPlus size="small" />
        </div>
      </div>
    </div>
  );
}
