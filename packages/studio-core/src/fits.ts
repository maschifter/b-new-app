import type { AcceptRule, CatalogItem, Spot, Tags } from "./types.ts";

// The one compatibility policy: does this item fit this spot? Pure and UI-free
// so the criterion can be tested and swapped without touching anything else
// (design §9.4). This is enforced at both write (picker) and read (reconcile).

function toValues(value: Tags[string]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * A `tags` rule matches when every required key is satisfied. A key is
 * satisfied when the item's value(s) intersect the required value(s) — this
 * handles single- and multi-valued tags on both sides. A required key that is
 * missing on the item is a reject (a spot cannot accept what it can't classify).
 */
function fitsTags(item: CatalogItem, require: Tags): boolean {
  for (const [key, requiredValue] of Object.entries(require)) {
    const itemValue = item.tags[key];
    if (itemValue === undefined) return false; // missing key on the item = reject

    const required = toValues(requiredValue);
    const owned = toValues(itemValue);
    if (!owned.some((value) => required.includes(value))) return false;
  }
  return true;
}

function evaluate(item: CatalogItem, rule: AcceptRule): boolean {
  switch (rule.kind) {
    case "tags":
      return fitsTags(item, rule.require);
    case "allow":
      return rule.ids.includes(item.id);
  }
}

export function fits(item: CatalogItem, spot: Spot): boolean {
  return evaluate(item, spot.accept);
}
