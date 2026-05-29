import { dbToTypes } from "../../data/datatypes";
import { databases } from "../../data/databases";

function formatFieldType(database, field) {
  const def = dbToTypes?.[database]?.[field.type];
  const sized = def && (def.isSized || def.hasPrecision);
  const hasSize = field.size != null && field.size !== "";
  return sized && hasSize ? `${field.type}(${field.size})` : field.type;
}

function normalizeViews(payload) {
  if (Array.isArray(payload?._internalViews) && payload._internalViews.length) {
    return payload._internalViews.map((v) => ({
      id: v.id,
      name: v.name ?? "View",
      tables: v.tables ?? [],
      relationships: v.relationships ?? v.references ?? [],
      notes: v.notes ?? [],
      subjectAreas: v.subjectAreas ?? v.areas ?? [],
    }));
  }
  if (Array.isArray(payload?.views) && payload.views.length) {
    return payload.views.map((v, i) => ({
      id: `view-${i}`,
      name: v.name ?? "View",
      tables: v.tables ?? [],
      relationships: v.relationships ?? v.references ?? [],
      notes: v.notes ?? [],
      subjectAreas: v.subjectAreas ?? v.areas ?? [],
    }));
  }
  return [
    {
      id: "main",
      name: "Main",
      tables: payload?.tables ?? [],
      relationships: payload?.relationships ?? payload?.references ?? [],
      notes: payload?.notes ?? [],
      subjectAreas: payload?.subjectAreas ?? payload?.areas ?? [],
    },
  ];
}

function buildTableRelationships(table, relationships, tablesById) {
  const fieldsById = new Map(table.fields.map((f) => [f.id, f]));
  const result = [];
  const seen = new Set();
  for (const r of relationships ?? []) {
    const isOutgoing = r.startTableId === table.id;
    const isIncoming = r.endTableId === table.id;
    if (!isOutgoing && !isIncoming) continue;
    const key = `${r.id ?? r.name}-${isOutgoing ? "out" : "in"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (isOutgoing) {
      const otherTable = tablesById.get(r.endTableId);
      const otherFields = otherTable
        ? new Map(otherTable.fields.map((f) => [f.id, f]))
        : new Map();
      result.push({
        name: r.name,
        direction: "outgoing",
        otherTable: otherTable?.name ?? "?",
        fieldName: fieldsById.get(r.startFieldId)?.name ?? "?",
        otherFieldName: otherFields.get(r.endFieldId)?.name ?? "?",
        cardinality: r.cardinality,
        updateConstraint: r.updateConstraint,
        deleteConstraint: r.deleteConstraint,
      });
    } else {
      // Skip incoming half of a self-relationship to avoid duplication.
      if (r.startTableId === r.endTableId) continue;
      const otherTable = tablesById.get(r.startTableId);
      const otherFields = otherTable
        ? new Map(otherTable.fields.map((f) => [f.id, f]))
        : new Map();
      result.push({
        name: r.name,
        direction: "incoming",
        otherTable: otherTable?.name ?? "?",
        fieldName: fieldsById.get(r.endFieldId)?.name ?? "?",
        otherFieldName: otherFields.get(r.startFieldId)?.name ?? "?",
        cardinality: r.cardinality,
        updateConstraint: r.updateConstraint,
        deleteConstraint: r.deleteConstraint,
      });
    }
  }
  return result;
}

function buildFieldRow(field, database, outgoingByFieldId) {
  const refs = (outgoingByFieldId.get(field.id) ?? []).map((r) => r.name);
  const row = {
    name: field.name,
    type: formatFieldType(database, field),
    pk: !!field.primary,
    nullable: !field.notNull,
    default: field.default ?? "",
    unique: !!field.unique,
    increment: !!field.increment,
    comment: field.comment ?? "",
    descriptionFr: field.descriptionFr ?? "",
    descriptionEn: field.descriptionEn ?? "",
    references: refs,
  };
  if (Array.isArray(field.values) && field.values.length) {
    row.values = field.values;
  }
  return row;
}

function buildViewModel(view, database, attachGlobals, globalEnums, globalTypes) {
  const tablesById = new Map(view.tables.map((t) => [t.id, t]));
  const outgoingByTableField = new Map();
  for (const r of view.relationships ?? []) {
    const key = r.startTableId;
    if (!outgoingByTableField.has(key)) {
      outgoingByTableField.set(key, new Map());
    }
    const inner = outgoingByTableField.get(key);
    if (!inner.has(r.startFieldId)) inner.set(r.startFieldId, []);
    inner.get(r.startFieldId).push(r);
  }

  const tables = view.tables.map((table) => {
    const outgoingByFieldId =
      outgoingByTableField.get(table.id) ?? new Map();
    return {
      id: table.id,
      name: table.name,
      comment: table.comment ?? "",
      descriptionFr: table.descriptionFr ?? "",
      descriptionEn: table.descriptionEn ?? "",
      fields: (table.fields ?? []).map((f) =>
        buildFieldRow(f, database, outgoingByFieldId),
      ),
      indices: (table.indices ?? []).map((idx) => ({
        name: idx.name,
        unique: !!idx.unique,
        fields: idx.fields ?? [],
      })),
      relationships: buildTableRelationships(
        table,
        view.relationships,
        tablesById,
      ),
    };
  });

  const columnCount = tables.reduce((s, t) => s + t.fields.length, 0);
  const model = {
    id: view.id,
    name: view.name,
    tableCount: tables.length,
    columnCount,
    relationshipCount: (view.relationships ?? []).length,
    tables,
  };

  if (attachGlobals) {
    if (globalEnums?.length) {
      model.enums = globalEnums.map((e) => ({
        name: e.name,
        values: e.values ?? [],
        comment: e.comment ?? "",
      }));
    }
    if (globalTypes?.length) {
      model.types = globalTypes.map((t) => ({
        name: t.name,
        fields: (t.fields ?? []).map((f) => f.name),
        comment: t.comment ?? "",
      }));
    }
  }
  return model;
}

/**
 * Build a normalized, render-agnostic documentation model from the export
 * payload used by the JSON branch. Tolerates legacy single-view payloads.
 * Enums and types are diagram-global; we attach them only to the first
 * view to avoid repetition across multi-view PDFs.
 */
export function buildDocModel(payload) {
  const database = payload?.database;
  const dbInfo = database ? databases[database] : null;
  const views = normalizeViews(payload);

  const globalEnums = dbInfo?.hasEnums ? payload?.enums ?? [] : [];
  const globalTypes = dbInfo?.hasTypes ? payload?.types ?? [] : [];

  const viewModels = views.map((v, i) =>
    buildViewModel(v, database, i === 0, globalEnums, globalTypes),
  );

  const totalTables = viewModels.reduce((s, v) => s + v.tableCount, 0);
  const totalColumns = viewModels.reduce((s, v) => s + v.columnCount, 0);
  const totalRelationships = viewModels.reduce(
    (s, v) => s + v.relationshipCount,
    0,
  );

  return {
    title: payload?.title ?? "Untitled",
    database,
    databaseName: dbInfo?.name ?? database ?? "Unknown",
    generatedAt: new Date().toISOString(),
    totalTables,
    totalColumns,
    totalRelationships,
    views: viewModels,
  };
}
