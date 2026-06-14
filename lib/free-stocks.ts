export type FreeStockItem = { ticker: string; signal: string | null }

const FREE_LIMIT = 5;

export function getDailyFreeStocks<T extends FreeStockItem>(
  allStocks: T[],
  limit: number = FREE_LIMIT,
): { visible: T[]; locked: T[] } {
  const today = new Date();
  const seed = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();

  let s = seed;
  function seededRandom() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return Math.abs(s) / 0xffffffff;
  }

  function seededShuffle<U>(arr: U[]): U[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const goodStocks = allStocks.filter(s => s.signal === 'BUY+' || s.signal === 'BUY');
  const restStocks = allStocks.filter(s => s.signal !== 'BUY+' && s.signal !== 'BUY');

  const shuffledGood = seededShuffle(goodStocks);
  const shuffledRest = seededShuffle(restStocks);

  const selected = [
    ...shuffledGood.slice(0, 2),
    ...shuffledRest.slice(0, limit - 2),
  ];

  const freeSet = new Set(selected.map(s => s.ticker));
  const visible = allStocks.filter(s => freeSet.has(s.ticker));
  const locked  = allStocks.filter(s => !freeSet.has(s.ticker));
  return { visible, locked };
}

export function getDailyFreeTickers(allStocks: FreeStockItem[], limit: number = FREE_LIMIT): Set<string> {
  const { visible } = getDailyFreeStocks(allStocks, limit);
  return new Set(visible.map(s => s.ticker));
}
