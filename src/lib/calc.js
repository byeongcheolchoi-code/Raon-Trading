export function calcTrade(t, capital) {
  const dir = t.side === 'long' ? 1 : -1;
  const entry = Number(t.entry), exit = Number(t.exit);
  const priceChangePct = entry > 0 ? (dir * (exit - entry)) / entry : 0;
  const leveragedPct = priceChangePct * Number(t.leverage);
  const grossPnlPct = leveragedPct * (Number(t.weight) / 100);
  const grossPnlAmount = capital * grossPnlPct;
  const feeEntry = Number(t.fee_entry) || 0;
  const feeExit = Number(t.fee_exit) || 0;
  const fee = feeEntry + feeExit;
  const pnlAmount = grossPnlAmount - fee;
  const pnlPct = capital > 0 ? pnlAmount / capital : 0;
  return { priceChangePct, leveragedPct, grossPnlPct, grossPnlAmount, feeEntry, feeExit, fee, pnlAmount, pnlPct };
}

export function computeStats(trades, capital) {
  if (trades.length === 0) return null;
  let wins = 0, losses = 0, sumWinPct = 0, sumLossPct = 0, cumAmount = 0, cumPct = 0;
  trades.forEach((t) => {
    const r = calcTrade(t, capital);
    cumAmount += r.pnlAmount;
    cumPct += r.pnlPct;
    if (r.pnlPct > 1e-12) { wins++; sumWinPct += r.pnlPct; }
    else if (r.pnlPct < -1e-12) { losses++; sumLossPct += Math.abs(r.pnlPct); }
  });
  const total = trades.length;
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
