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

db.on("populate", (transaction) => {
  transaction.templates.bulkAdd(templateSeeds).catch((e) => console.log(e));
});
