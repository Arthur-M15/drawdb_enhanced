import Dexie from "dexie";
import { templateSeeds } from "./seeds";

export const db = new Dexie("drawDB");

db.version(67)
  .stores({
    diagrams: "++id, lastModified, loadedFromGistId, diagramId",
    templates: "++id, custom, templateId",
  })
  .upgrade(async (tx) => {
    await tx.diagrams.toCollection().modify((diagram) => {
      if (!diagram.diagramId) {
        diagram.diagramId = crypto.randomUUID();
      }
    });
    await tx.templates.toCollection().modify((template) => {
      if (!template.templateId) {
        template.templateId = crypto.randomUUID();
      }
    });
  });

db.version(68)
  .stores({
    diagrams: "++id, lastModified, loadedFromGistId, diagramId",
    templates: "++id, custom, templateId",
  })
  .upgrade(async (tx) => {
    await tx.diagrams.toCollection().modify((diagram) => {
      if (diagram.views) return; // already migrated — skip

      const viewId = crypto.randomUUID();
      diagram.views = [
        {
          id: viewId,
          name: "Main",
          tables: diagram.tables ?? [],
          references: diagram.references ?? [],
          notes: diagram.notes ?? [],
          areas: diagram.areas ?? [],
          pan: diagram.pan ?? { x: 0, y: 0 },
          zoom: diagram.zoom ?? 1,
          ...(diagram.enums !== undefined && { enums: diagram.enums }),
          ...(diagram.types !== undefined && { types: diagram.types }),
        },
      ];
      diagram.activeViewId = viewId;

      delete diagram.tables;
      delete diagram.references;
      delete diagram.notes;
      delete diagram.areas;
      delete diagram.pan;
      delete diagram.zoom;
      delete diagram.enums;
      delete diagram.types;
    });
  });

db.version(69)
  .stores({
    diagrams: "++id, lastModified, loadedFromGistId, diagramId",
    templates: "++id, custom, templateId",
  })
  .upgrade(async (tx) => {
    await tx.diagrams.toCollection().modify((diagram) => {
      if (!Array.isArray(diagram.views) || diagram.views.length === 0) return;

      const hasNestedTypes = diagram.views.some(
        (v) => v && v.types !== undefined,
      );
      const hasNestedEnums = diagram.views.some(
        (v) => v && v.enums !== undefined,
      );
      if (!hasNestedTypes && !hasNestedEnums) return; // already hoisted — skip

      if (diagram.types === undefined && hasNestedTypes) {
        const firstWithTypes = diagram.views.find(
          (v) => Array.isArray(v.types) && v.types.length > 0,
        );
        diagram.types =
          firstWithTypes?.types ??
          diagram.views.find((v) => v.types !== undefined)?.types ??
          [];
      }
      if (diagram.enums === undefined && hasNestedEnums) {
        const firstWithEnums = diagram.views.find(
          (v) => Array.isArray(v.enums) && v.enums.length > 0,
        );
        diagram.enums =
          firstWithEnums?.enums ??
          diagram.views.find((v) => v.enums !== undefined)?.enums ??
          [];
      }

      diagram.views = diagram.views.map((v) => {
        if (!v) return v;
        const rest = { ...v };
        delete rest.types;
        delete rest.enums;
        return rest;
      });
    });
  });

db.on("populate", (transaction) => {
  transaction.templates.bulkAdd(templateSeeds).catch((e) => console.log(e));
});
