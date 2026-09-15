import { useMemo, useState } from "react";
import { Input } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import {
  useDiagram,
  useSelect,
  useSettings,
  useTransform,
  useViews,
} from "../../hooks";
import { ObjectType } from "../../data/constants";

const normalizeSearchValue = (value) =>
  value.replaceAll("_", "").toLocaleLowerCase();

export default function ViewSearch() {
  const { views, activeViewId, switchView } = useViews();
  const { tables } = useDiagram();
  const { setSelectedElement, setBulkSelectedElements } = useSelect();
  const { setTransform } = useTransform();
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const { t } = useTranslation();

  const searchResults = useMemo(() => {
    const prefix = normalizeSearchValue(query.trim());
    if (!prefix) return [];

    const currentTables = new Map(tables.map((table) => [table.id, table]));
    const tableResults = views.flatMap((view) =>
      (view.id === activeViewId ? tables : (view.tables ?? []))
        .filter((table) =>
          normalizeSearchValue(table.name).startsWith(prefix),
        )
        .map((table) => ({
          type: "table",
          id: table.id,
          name: table.name,
          viewId: view.id,
          viewName: view.name,
          table:
            view.id === activeViewId
              ? (currentTables.get(table.id) ?? table)
              : table,
        })),
    );
    const viewResults = views
      .filter((view) => normalizeSearchValue(view.name).startsWith(prefix))
      .map((view) => ({
        type: "view",
        id: view.id,
        name: view.name,
        viewId: view.id,
      }));

    return [...tableResults, ...viewResults]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 5);
  }, [activeViewId, query, tables, views]);

  const selectSearchResult = (result) => {
    switchView(result.viewId);

    if (result.type === "table") {
      setSelectedElement((previous) => ({
        ...previous,
        element: ObjectType.TABLE,
        id: result.table.id,
        open: false,
      }));
      setBulkSelectedElements([]);
      setTransform((previous) => ({
        ...previous,
        pan: {
          x: result.table.x + settings.tableWidth / 2,
          y: result.table.y + 100,
        },
      }));
    }

    setQuery("");
    setSearchOpen(false);
    setHighlightedIndex(0);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) =>
        Math.min(index + 1, searchResults.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && searchResults[highlightedIndex]) {
      event.preventDefault();
      selectSearchResult(searchResults[highlightedIndex]);
    } else if (event.key === "Escape") {
      setSearchOpen(false);
    }
  };

  if (!views?.length) return null;

  return (
    <div className="relative flex items-center me-2 shrink-0">
      <Input
        prefix={<IconSearch />}
        size="small"
        value={query}
        placeholder={t("search_tables_views")}
        aria-label={t("search_tables_views")}
        style={{ width: "220px" }}
        onFocus={() => setSearchOpen(true)}
        onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
        onChange={(value) => {
          setQuery(value);
          setSearchOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {searchOpen && query.trim() && (
        <div
          className="absolute top-full left-0 mt-1 w-[320px] max-w-[calc(100vw-16px)] border border-color rounded-md shadow-lg overflow-hidden z-50 toolbar-theme"
          role="listbox"
        >
          {searchResults.length === 0 ? (
            <div className="px-3 py-2 text-sm text-color">
              {t("no_search_results")}
            </div>
          ) : (
            searchResults.map((result, index) => (
              <button
                key={`${result.type}-${result.viewId}-${result.id}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm text-color ${
                  index === highlightedIndex ? "bg-semi-grey-2" : "hover-1"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectSearchResult(result)}
              >
                <span className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                  {result.name}
                </span>
                <span className="text-xs text-semi-color-text-2 whitespace-nowrap">
                  {result.type === "table" ? result.viewName : t("pdm_result")}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}