import { Banner, Checkbox, CheckboxGroup, Spin } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";

export default function ExportPdf({
  views,
  selectedViewIds,
  setSelectedViewIds,
  generating,
  progress,
  error,
}) {
  const { t } = useTranslation();

  if (generating) {
    return (
      <div className="text-center my-3 text-sky-600">
        <Spin tip={t("generating_pdf")} size="large" />
        {progress && progress.total > 0 && (
          <div className="mt-2 text-sm text-slate-600">
            {progress.done} / {progress.total}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm font-semibold mb-2">
        {t("select_views_to_export")}
      </div>
      <CheckboxGroup
        value={selectedViewIds}
        onChange={setSelectedViewIds}
        direction="vertical"
      >
        {views.map((v) => (
          <Checkbox key={v.id} value={v.id}>
            {v.name}
            <span className="text-xs text-slate-400 ml-2">
              ({v.tableCount})
            </span>
          </Checkbox>
        ))}
      </CheckboxGroup>
      {error && (
        <Banner type="danger" description={error} className="mt-3" />
      )}
    </div>
  );
}
