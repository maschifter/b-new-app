interface PricedItem {
  price?: number;
}

export function resolvePrice(item: PricedItem): number {
  return item.price ?? 0;
}

export function canAfford(glow: number, item: PricedItem): boolean {
  return glow >= resolvePrice(item);
}
