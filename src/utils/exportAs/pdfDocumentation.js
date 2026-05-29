import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";
import { buildDocModel } from "./docModel";

const PAGE_MARGIN = 40;
const YIELD_EVERY = 20;
const LINE_HEIGHT = 12;

class CancelError extends Error {
  constructor() {
    super("PDF generation cancelled");
    this.name = "CancelError";
  }
}

export const isCancelError = (e) => e?.name === "CancelError";

function pageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc) {
  return doc.internal.pageSize.getHeight();
}

function usableWidth(doc) {
  return pageWidth(doc) - PAGE_MARGIN * 2;
}

function newPage(doc) {
  doc.addPage();
  return PAGE_MARGIN;
}

function ensureSpace(doc, y, needed) {
  if (y + needed > pageHeight(doc) - PAGE_MARGIN) {
    return newPage(doc);
  }
  return y;
}

function writeWrapped(doc, text, x, y, maxWidth) {
  const lines = doc.splitTextToSize(text ?? "", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * LINE_HEIGHT;
}

function renderTitlePage(doc, model, selectedViews) {
  let y = PAGE_MARGIN + 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  y = writeWrapped(
    doc,
    `${model.title}`,
    PAGE_MARGIN,
    y,
    usableWidth(doc),
  );
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  y = writeWrapped(doc, "Database documentation", PAGE_MARGIN, y, usableWidth(doc));
  y += 24;

  const selectedTables = selectedViews.reduce((s, v) => s + v.tableCount, 0);
  const selectedColumns = selectedViews.reduce(
    (s, v) => s + v.columnCount,
    0,
  );

  const lines = [
    ["Database system", model.databaseName],
    ["Views included", `${selectedViews.length} / ${model.views.length}`],
    ["Tables", String(selectedTables)],
    ["Columns", String(selectedColumns)],
    ["Generated", new Date(model.generatedAt).toLocaleString()],
  ];

  autoTable(doc, {
    startY: y,
    body: lines,
    theme: "plain",
    styles: { fontSize: 11, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: "bold" },
      1: { cellWidth: usableWidth(doc) - 130 },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
}

function renderViewHeader(doc, view) {
  newPage(doc);
  let y = PAGE_MARGIN + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  y = writeWrapped(
    doc,
    `View: ${view.name}`,
    PAGE_MARGIN,
    y,
    usableWidth(doc),
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const counts = `${view.tableCount} tables · ${view.columnCount} columns · ${view.relationshipCount} relationships`;
  y = writeWrapped(doc, counts, PAGE_MARGIN, y + 4, usableWidth(doc));
  return y + 12;
}

function renderBilingualDescriptions(doc, item, y) {
  const fr = (item.descriptionFr ?? "").trim();
  const en = (item.descriptionEn ?? "").trim();
  if (!fr && !en) return y;
  doc.setFontSize(10);
  for (const [label, text] of [
    ["FR", fr],
    ["EN", en],
  ]) {
    if (!text) continue;
    y = ensureSpace(doc, y, 24);
    doc.setFont("helvetica", "bolditalic");
    doc.text(`${label}:`, PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    y = writeWrapped(
      doc,
      text,
      PAGE_MARGIN + 22,
      y,
      usableWidth(doc) - 22,
    );
    y += 2;
  }
  return y + 2;
}

function fieldRowToCells(field) {
  return [
    field.name,
    field.type ?? "",
    field.pk ? "✓" : "",
    field.nullable ? "✓" : "",
    field.default ?? "",
    field.unique ? "✓" : "",
    field.increment ? "✓" : "",
    field.comment ?? "",
    field.descriptionFr ?? "",
    field.descriptionEn ?? "",
  ];
}

function renderFieldsTable(doc, table, startY) {
  if (!table.fields.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("(no fields)", PAGE_MARGIN, startY);
    return startY + LINE_HEIGHT;
  }
  autoTable(doc, {
    startY,
    head: [
      [
        "Name",
        "Type",
        "PK",
        "Null",
        "Default",
        "Unique",
        "Auto",
        "Comment",
        "FR",
        "EN",
      ],
    ],
    body: table.fields.map(fieldRowToCells),
    styles: { fontSize: 8, overflow: "linebreak", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: "bold" },
      1: { cellWidth: 55 },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 45 },
      5: { cellWidth: 32, halign: "center" },
      6: { cellWidth: 32, halign: "center" },
      7: { cellWidth: 70 },
      8: { cellWidth: 70 },
      9: { cellWidth: 70 },
    },
    headStyles: { fillColor: [60, 60, 60] },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
  return doc.lastAutoTable.finalY + 8;
}

function renderIndicesTable(doc, table, startY) {
  if (!table.indices.length) return startY;
  let y = ensureSpace(doc, startY, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Indices", PAGE_MARGIN, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    head: [["Name", "Unique", "Fields"]],
    body: table.indices.map((idx) => [
      idx.name,
      idx.unique ? "✓" : "",
      (idx.fields ?? []).join(", "),
    ]),
    styles: { fontSize: 8, overflow: "linebreak", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 50, halign: "center" },
      2: { cellWidth: usableWidth(doc) - 170 },
    },
    headStyles: { fillColor: [80, 80, 80] },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
  return doc.lastAutoTable.finalY + 8;
}

function renderRelationshipsTable(doc, table, startY) {
  if (!table.relationships.length) return startY;
  let y = ensureSpace(doc, startY, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Relationships", PAGE_MARGIN, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    head: [["Name", "Direction", "Field", "Other table", "Other field", "Cardinality"]],
    body: table.relationships.map((r) => [
      r.name ?? "",
      r.direction === "outgoing" ? "→" : "←",
      r.fieldName ?? "",
      r.otherTable ?? "",
      r.otherFieldName ?? "",
      r.cardinality ?? "",
    ]),
    styles: { fontSize: 8, overflow: "linebreak", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 40, halign: "center" },
      2: { cellWidth: 70 },
      3: { cellWidth: 90 },
      4: { cellWidth: 70 },
      5: { cellWidth: usableWidth(doc) - 380 },
    },
    headStyles: { fillColor: [80, 80, 80] },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
  return doc.lastAutoTable.finalY + 12;
}

function renderTable(doc, table, startY) {
  let y = ensureSpace(doc, startY, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  y = writeWrapped(doc, table.name, PAGE_MARGIN, y, usableWidth(doc));
  if (table.comment) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    y = writeWrapped(doc, table.comment, PAGE_MARGIN, y + 2, usableWidth(doc));
  }
  y = renderBilingualDescriptions(doc, table, y + 4);
  y = ensureSpace(doc, y, 60);
  y = renderFieldsTable(doc, table, y);
  y = renderIndicesTable(doc, table, y);
  y = renderRelationshipsTable(doc, table, y);
  return y;
}

function renderEnumsAndTypes(doc, view, startY) {
  let y = startY;
  if (view.enums?.length) {
    y = ensureSpace(doc, y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Enums", PAGE_MARGIN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Name", "Values", "Comment"]],
      body: view.enums.map((e) => [
        e.name,
        (e.values ?? []).join(", "),
        e.comment ?? "",
      ]),
      styles: { fontSize: 9, overflow: "linebreak", cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "bold" },
        1: { cellWidth: usableWidth(doc) - 250 },
        2: { cellWidth: 130 },
      },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  if (view.types?.length) {
    y = ensureSpace(doc, y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Types", PAGE_MARGIN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Name", "Fields", "Comment"]],
      body: view.types.map((t) => [
        t.name,
        (t.fields ?? []).join(", "),
        t.comment ?? "",
      ]),
      styles: { fontSize: 9, overflow: "linebreak", cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "bold" },
        1: { cellWidth: usableWidth(doc) - 250 },
        2: { cellWidth: 130 },
      },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  return y;
}

function renderTocAppendix(doc, view, tableIndex, startY) {
  if (!tableIndex.length) return startY;
  let y = ensureSpace(doc, startY, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Table index — ${view.name}`, PAGE_MARGIN, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [["Table", "Page"]],
    body: tableIndex.map((entry) => [entry.name, String(entry.page)]),
    styles: { fontSize: 9, overflow: "linebreak", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: usableWidth(doc) - 80 },
      1: { cellWidth: 80, halign: "right" },
    },
    headStyles: { fillColor: [60, 60, 60] },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
  return doc.lastAutoTable.finalY + 8;
}

export async function generatePdfDocumentation({
  payload,
  selectedViewIds,
  filename,
  onProgress,
  cancelRef,
}) {
  const model = buildDocModel(payload);
  const selectedSet = new Set(selectedViewIds ?? []);
  const selectedViews = selectedSet.size
    ? model.views.filter((v) => selectedSet.has(v.id))
    : model.views;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  renderTitlePage(doc, model, selectedViews);

  const totalTables = selectedViews.reduce((s, v) => s + v.tableCount, 0);
  let processed = 0;
  onProgress?.(0, totalTables);

  for (const view of selectedViews) {
    if (cancelRef?.current) throw new CancelError();
    let y = renderViewHeader(doc, view);

    if (!view.tables.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.text("No tables in this view.", PAGE_MARGIN, y);
      y += LINE_HEIGHT * 2;
    }

    const tableIndex = [];
    for (const table of view.tables) {
      if (cancelRef?.current) throw new CancelError();
      const startPage = doc.internal.getNumberOfPages();
      y = renderTable(doc, table, y);
      tableIndex.push({ name: table.name, page: startPage });
      processed += 1;
      if (processed % YIELD_EVERY === 0) {
        onProgress?.(processed, totalTables);
        // Yield to the event loop so React can repaint and Cancel can land.
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    y = renderEnumsAndTypes(doc, view, y);
    renderTocAppendix(doc, view, tableIndex, y);
  }

  onProgress?.(totalTables, totalTables);
  const blob = doc.output("blob");
  saveAs(blob, `${filename}.pdf`);
  return doc;
}
