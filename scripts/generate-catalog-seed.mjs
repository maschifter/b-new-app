import { CATALOG, defaultItemLabel } from "../packages/studio-core/dist/index.js";

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const rows = CATALOG.map((item) => {
  const values = [
    sqlString(item.id),
    `${sqlString(JSON.stringify(item.tags))}::jsonb`,
    sqlString(defaultItemLabel(item.id)),
    "'published'",
    "'free'",
  ];

  return `  (${values.join(", ")})`;
});

process.stdout.write(
  [
    "insert into public.catalog_items (id, tags, display_name, status, access)",
    "values",
    `${rows.join(",\n")}\n`,
    "on conflict (id) do nothing;",
    "",
  ].join("\n"),
);
