// usdKrwRate converts fee_entry/fee_exit, which are entered in USDT (matching what
// exchanges actually charge), into KRW so they can be netted against the
// KRW-denominated capital. Prices (entry/exit) stay unitless since only their ratio
// is used, so no conversion is needed there.
export function calcTrade(t, capital, usdKrwRate = 1) {
  const dir = t.side === 'long' ? 1 : -1;
  const entry = Number(t.entry), exit = Number(t.exit);
  const priceChangePct = entry > 0 ? (dir * (exit - entry)) / entry : 0;
  const leveragedPct = priceChangePct * Number(t.leverage);
  const grossPnlPct = leveragedPct * (Number(t.weight) / 100);
  const grossPnlAmount = capital * grossPnlPct;
  const feeEntryUsdt = Number(t.fee_entry) || 0;
  const feeExitUsdt = Number(t.fee_exit) || 0;
  const feeEntry = feeEntryUsdt * usdKrwRate;
  const feeExit = feeExitUsdt * usdKrwRate;
  const fee = feeEntry + feeExit;
  const pnlAmount = grossPnlAmount - fee;
  const pnlPct = capital > 0 ? pnlAmount / capital : 0;
  return { priceChangePct, leveragedPct, grossPnlPct, grossPnlAmount, feeEntryUsdt, feeExitUsdt, feeEntry, feeExit, fee, pnlAmount, pnlPct };
}

// groups rows that share position_group into one logical position (분할청산), so a
// scaled-out winning position counts as one win instead of one per partial exit;
// ungrouped rows each remain their own singleton position
function groupIntoPositions(trades) {
  const groups = new Map();
  let anon = 0;
  trades.forEach((t) => {
    const key = t.position_group || `__single__${anon++}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  return groups;
}

export function computeStats(trades, capital, usdKrwRate = 1) {
  if (trades.length === 0) return null;
  const groups = groupIntoPositions(trades);
  let wins = 0, losses = 0, sumWinPct = 0, sumLossPct = 0, cumAmount = 0, cumPct = 0;
  groups.forEach((rows) => {
    let gAmount = 0, gPct = 0;
    rows.forEach((t) => {
      const r = calcTrade(t, capital, usdKrwRate);
      gAmount += r.pnlAmount;
      gPct += r.pnlPct;
      cumAmount += r.pnlAmount;
      cumPct += r.pnlPct;
    });
    if (gPct > 1e-12) { wins++; sumWinPct += gPct; }
    else if (gPct < -1e-12) { losses++; sumLossPct += Math.abs(gPct); }
  });
  const total = groups.size;
  const winRate = wins / total;
  const avgWin = wins ? sumWinPct / wins : 0;
  const avgLoss = losses ? sumLossPct / losses : 0;
  const plRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
  return { total, wins, losses, winRate, avgWin, avgLoss, plRatio, cumAmount, cumPct };
}

export function sortedAsc(trades) {
  const copy = trades.slice();
  copy.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  return copy;
}

export function fmtWon(n) {
  const r = Math.round(n);
  const sign = r > 0 ? '+' : r < 0 ? '-' : '';
  return sign + '₩' + Math.abs(r).toLocaleString('ko-KR');
}

export function fmtPct(n, digits = 2) {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return sign + Math.abs(n * 100).toFixed(digits) + '%';
}

export function fmtPrice(n) {
  return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 6 });
}
