import './style.css';
import { supabase } from './supabaseClient.js';
import { calcTrade, computeStats, sortedAsc, fmtWon, fmtPct, fmtPrice } from './lib/calc.js';

const DEFAULT_CAPITAL = 10000000;
const root = document.getElementById('app');

const state = {
  session: null,
  trades: [],
  watchlist: [],
  capital: DEFAULT_CAPITAL,
  loading: true,
  currentSide: 'long',
  currentMargin: 'cross',
  editingId: null,
  deferredInstallPrompt: null,
};

// ---------- PWA install prompt ----------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.hidden = false;
});
window.addEventListener('appinstalled', () => {
  state.deferredInstallPrompt = null;
  const btn = document.getElementById('installBtn');
  if (btn) btn.hidden = true;
});

// ---------- bootstrap ----------
if (!supabase) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>⚠️ 설정이 필요합니다</h1>
        <p class="sub">.env 파일에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정한 뒤 다시 빌드/실행해주세요. (README.md 참고)</p>
      </div>
    </div>`;
} else {
  init();
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  state.loading = false;
  render();
  if (state.session) await loadData();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const wasSignedIn = !!state.session;
    state.session = session;
    const isSignedIn = !!session;
    if (wasSignedIn !== isSignedIn) render(); // switch between login screen and app shell
    if (isSignedIn) {
      await loadData();
    } else if (tradesChannel) {
      supabase.removeChannel(tradesChannel);
      tradesChannel = null;
    }
  });
}

let tradesChannel = null;

// refresh just the data-driven parts of an already-built app view, without
// tearing down the form (which would drop in-progress input and focus)
function refreshView() {
  if (window.__formatCapital) window.__formatCapital();
  if (window.__renderAll) window.__renderAll();
}

async function loadData() {
  const uid = state.session.user.id;

  const { data: settingsRow } = await supabase.from('settings').select('capital').eq('user_id', uid).maybeSingle();
  state.capital = settingsRow && typeof settingsRow.capital === 'number' ? settingsRow.capital : DEFAULT_CAPITAL;

  const { data: tradeRows, error } = await supabase.from('trades').select('*').eq('user_id', uid).order('date', { ascending: true });
  if (!error) state.trades = tradeRows || [];

  const { data: wlRows } = await supabase.from('watchlist').select('*').eq('user_id', uid).order('created_at', { ascending: true });
  state.watchlist = wlRows || [];

  refreshView();

  if (tradesChannel) supabase.removeChannel(tradesChannel);
  tradesChannel = supabase
    .channel('trades-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${uid}` }, () => {
      refetchTrades();
    })
    .subscribe();
}

async function refetchTrades() {
  const uid = state.session.user.id;
  const { data, error } = await supabase.from('trades').select('*').eq('user_id', uid).order('date', { ascending: true });
  if (!error) { state.trades = data || []; refreshView(); }
}

async function refetchWatchlist() {
  const uid = state.session.user.id;
  const { data, error } = await supabase.from('watchlist').select('*').eq('user_id', uid).order('created_at', { ascending: true });
  if (!error) { state.watchlist = data || []; refreshView(); }
}

// ---------- render ----------
function render() {
  if (state.loading) {
    root.innerHTML = `<div class="auth-loading">불러오는 중…</div>`;
    return;
  }
  if (!state.session) {
    renderAuthScreen();
    return;
  }
  renderApp();
}

function renderAuthScreen() {
  window.__renderAll = null;
  window.__formatCapital = null;
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>◆ 레버리지 매매일지</h1>
        <p class="sub">로그인하면 거래 기록이 안전하게 저장됩니다.</p>
        <div class="auth-field">
          <label for="authEmail">이메일</label>
          <input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com">
        </div>
        <div class="auth-field">
          <label for="authPassword">비밀번호</label>
          <input id="authPassword" type="password" autocomplete="current-password" placeholder="6자 이상">
        </div>
        <div class="auth-actions">
          <button type="button" id="signInBtn" class="primary">로그인</button>
          <button type="button" id="signUpBtn">회원가입</button>
        </div>
        <div class="auth-msg" id="authMsg"></div>
      </div>
    </div>`;

  const emailEl = document.getElementById('authEmail');
  const pwEl = document.getElementById('authPassword');
  const msgEl = document.getElementById('authMsg');

  function setMsg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  document.getElementById('signInBtn').addEventListener('click', async () => {
    setMsg('로그인 중…');
    const { error } = await supabase.auth.signInWithPassword({ email: emailEl.value.trim(), password: pwEl.value });
    if (error) setMsg(error.message, 'error'); else setMsg('');
  });
  document.getElementById('signUpBtn').addEventListener('click', async () => {
    setMsg('가입 처리 중…');
    const { error } = await supabase.auth.signUp({ email: emailEl.value.trim(), password: pwEl.value });
    if (error) setMsg(error.message, 'error');
    else setMsg('가입 확인 메일을 보냈습니다. 메일함을 확인해주세요 (확인 설정에 따라 바로 로그인될 수도 있습니다).', 'ok');
  });
}

function renderApp() {
  root.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">◆</span>
        <div>
          <h1>레버리지 매매일지</h1>
          <p class="brand-sub">포지션 기록 · 승률 · 손익비 추적</p>
        </div>
      </div>
      <div class="header-actions">
        <div class="capital-control">
          <label for="capitalInput">초기자본</label>
          <div class="capital-field"><span>₩</span><input id="capitalInput" type="text" inputmode="numeric"></div>
        </div>
        <button type="button" class="ghost-btn" id="watchlistBtn">☆ 관심종목</button>
        <button type="button" class="install-btn" id="installBtn" hidden>⬇️ 앱 설치</button>
        <button type="button" class="ghost-btn" id="signOutBtn">로그아웃</button>
      </div>
    </header>

    <section class="stats-grid">
      <div class="stat-tile"><div class="stat-label">승률</div><div class="stat-value" id="statWinRate">—</div><div class="stat-sub" id="statWinRateSub">거래 없음</div></div>
      <div class="stat-tile"><div class="stat-label">손익비</div><div class="stat-value" id="statPLRatio">—</div><div class="stat-sub" id="statPLRatioSub">평균익 / 평균손</div></div>
      <div class="stat-tile"><div class="stat-label">계좌손익</div><div class="stat-value" id="statPnlAmount">—</div><div class="stat-sub" id="statPnlAmountSub">자본 대비 0%</div></div>
      <div class="stat-tile"><div class="stat-label">총 거래</div><div class="stat-value" id="statTotal">0</div><div class="stat-sub" id="statTotalSub">승 0 · 패 0</div></div>
    </section>

    <section class="chart-card">
      <div class="chart-head"><h2>누적 손익</h2><span class="chart-sub" id="chartRange">거래 없음</span></div>
      <div class="chart-wrap">
        <svg id="pnlChart" viewBox="0 0 760 220" preserveAspectRatio="none" role="img" aria-label="누적 손익 곡선"></svg>
        <div class="chart-empty" id="chartEmpty">첫 거래를 입력하면 손익 곡선이 여기에 표시됩니다</div>
      </div>
      <p class="chart-caption">기준선(0) 위는 이익 구간, 아래는 손실 구간입니다.</p>
    </section>

    <section class="grid-main">
      <div class="entry-card">
        <h2>거래 입력</h2>
        <div class="editing-banner" id="editingBanner" hidden>✏️ 거래를 수정하는 중입니다</div>
        <form id="tradeForm">
          <div class="field-row">
            <div class="field"><label for="dateInput">날짜</label><input id="dateInput" type="date" required></div>
            <div class="field"><label for="symbolInput">종목</label><input id="symbolInput" type="text" placeholder="BTCUSDT" required></div>
          </div>
          <div class="field"><label>방향</label>
            <div class="segctrl" id="sideCtrl">
              <button type="button" data-side="long" class="active">롱 (매수)</button>
              <button type="button" data-side="short">숏 (매도)</button>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label for="entryInput">매수단가</label><input id="entryInput" type="number" step="any" min="0" required></div>
            <div class="field"><label for="exitInput">매도단가</label><input id="exitInput" type="number" step="any" min="0" required></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="weightInput">비중 (%)</label><input id="weightInput" type="number" step="any" min="0" max="100" required></div>
            <div class="field"><label for="leverageInput">배율 (0–100배)</label>
              <div class="leverage-row">
                <input id="leverageRange" type="range" min="0" max="100" step="1" value="1">
                <input id="leverageInput" class="mono lev-num" type="number" min="0" max="100" step="1" value="1">
              </div>
            </div>
          </div>
          <div class="field"><label>마진 모드</label>
            <div class="segctrl" id="marginCtrl">
              <button type="button" data-margin="cross" class="active">교차 (Cross)</button>
              <button type="button" data-margin="isolated">격리 (Isolated)</button>
            </div>
          </div>
          <div class="field"><label for="memoInput">메모 (선택)</label><textarea id="memoInput" placeholder="진입 이유, 전략, 복기 등"></textarea></div>
          <div class="preview-box"><span>예상 손익</span><strong id="previewValue" class="mono">—</strong></div>
          <div class="form-error" id="formError"></div>
          <div class="form-actions">
            <button class="submit-btn" id="submitBtn" type="submit">거래 저장</button>
            <button class="cancel-edit-btn" id="cancelEditBtn" type="button" hidden>취소</button>
          </div>
        </form>
      </div>

      <div class="table-card">
        <div class="table-head"><h2>거래 내역</h2><span id="tradeCount">0건</span></div>
        <div class="table-scroll">
          <table id="tradeTable">
            <thead><tr><th>날짜</th><th>종목</th><th>방향</th><th>매수가</th><th>매도가</th><th>비중</th><th>배율</th><th>마진</th><th>손익%</th><th>손익액</th><th>결과</th><th></th></tr></thead>
            <tbody id="tradeTbody"></tbody>
          </table>
        </div>
        <div class="table-empty" id="tableEmpty">아직 입력된 거래가 없습니다. 왼쪽 폼에서 첫 거래를 기록해보세요.</div>
      </div>
    </section>
  </div>

  <div class="watchlist-overlay" id="watchlistOverlay" hidden>
    <div class="watchlist-panel" role="dialog" aria-modal="true" aria-labelledby="watchlistTitle">
      <div class="watchlist-head">
        <h2 id="watchlistTitle">☆ 관심종목</h2>
        <button type="button" class="watchlist-close" id="watchlistClose" aria-label="닫기">✕</button>
      </div>
      <form class="watchlist-add-row" id="wlAddForm">
        <input id="wlSymbolInput" type="text" placeholder="예: BTCUSDT" maxlength="20">
        <button type="submit">추가</button>
      </form>
      <div class="watchlist-msg" id="watchlistMsg"></div>
      <div class="watchlist-list" id="watchlistList"></div>
      <div class="watchlist-empty" id="watchlistEmpty">아직 등록한 관심종목이 없습니다</div>
      <p class="watchlist-hint">종목을 클릭하면 거래 입력 폼에 바로 채워집니다.</p>
    </div>
  </div>`;

  wireApp();
}

function wireApp() {
  const els = {
    capitalInput: document.getElementById('capitalInput'),
    installBtn: document.getElementById('installBtn'),
    signOutBtn: document.getElementById('signOutBtn'),
    statWinRate: document.getElementById('statWinRate'),
    statWinRateSub: document.getElementById('statWinRateSub'),
    statPLRatio: document.getElementById('statPLRatio'),
    statPLRatioSub: document.getElementById('statPLRatioSub'),
    statPnlAmount: document.getElementById('statPnlAmount'),
    statPnlAmountSub: document.getElementById('statPnlAmountSub'),
    statTotal: document.getElementById('statTotal'),
    statTotalSub: document.getElementById('statTotalSub'),
    chartRange: document.getElementById('chartRange'),
    chartEmpty: document.getElementById('chartEmpty'),
    svg: document.getElementById('pnlChart'),
    form: document.getElementById('tradeForm'),
    dateInput: document.getElementById('dateInput'),
    symbolInput: document.getElementById('symbolInput'),
    entryInput: document.getElementById('entryInput'),
    exitInput: document.getElementById('exitInput'),
    weightInput: document.getElementById('weightInput'),
    leverageRange: document.getElementById('leverageRange'),
    leverageInput: document.getElementById('leverageInput'),
    memoInput: document.getElementById('memoInput'),
    previewValue: document.getElementById('previewValue'),
    formError: document.getElementById('formError'),
    submitBtn: document.getElementById('submitBtn'),
    tradeTbody: document.getElementById('tradeTbody'),
    tradeCount: document.getElementById('tradeCount'),
    tableEmpty: document.getElementById('tableEmpty'),
    sideCtrl: document.getElementById('sideCtrl'),
    marginCtrl: document.getElementById('marginCtrl'),
    editingBanner: document.getElementById('editingBanner'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    watchlistBtn: document.getElementById('watchlistBtn'),
    watchlistOverlay: document.getElementById('watchlistOverlay'),
    watchlistClose: document.getElementById('watchlistClose'),
    wlAddForm: document.getElementById('wlAddForm'),
    wlSymbolInput: document.getElementById('wlSymbolInput'),
    watchlistMsg: document.getElementById('watchlistMsg'),
    watchlistList: document.getElementById('watchlistList'),
    watchlistEmpty: document.getElementById('watchlistEmpty'),
  };

  if (state.deferredInstallPrompt) els.installBtn.hidden = false;
  els.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });

  els.signOutBtn.addEventListener('click', async () => {
    if (tradesChannel) { supabase.removeChannel(tradesChannel); tradesChannel = null; }
    await supabase.auth.signOut();
  });

  function openWatchlist() { els.watchlistOverlay.hidden = false; els.watchlistMsg.textContent = ''; els.wlSymbolInput.focus(); }
  function closeWatchlist() { els.watchlistOverlay.hidden = true; }
  els.watchlistBtn.addEventListener('click', openWatchlist);
  els.watchlistClose.addEventListener('click', closeWatchlist);
  els.watchlistOverlay.addEventListener('click', (e) => { if (e.target === els.watchlistOverlay) closeWatchlist(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.watchlistOverlay.hidden) closeWatchlist(); });

  els.wlAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const symbol = (els.wlSymbolInput.value || '').trim().toUpperCase();
    els.watchlistMsg.textContent = '';
    if (!symbol) return;
    const { error } = await supabase.from('watchlist').insert({ user_id: state.session.user.id, symbol });
    if (error) {
      els.watchlistMsg.textContent = error.code === '23505' ? '이미 추가된 종목입니다.' : '추가 실패: ' + error.message;
      return;
    }
    els.wlSymbolInput.value = '';
    refetchWatchlist();
  });

  function renderWatchlist() {
    const list = state.watchlist;
    els.watchlistEmpty.hidden = list.length !== 0;
    els.watchlistList.innerHTML = '';
    list.forEach((w) => {
      const row = document.createElement('div');
      row.className = 'watchlist-item';
      const useBtn = document.createElement('button');
      useBtn.className = 'wl-symbol';
      useBtn.type = 'button';
      useBtn.textContent = w.symbol;
      useBtn.addEventListener('click', () => {
        els.symbolInput.value = w.symbol;
        closeWatchlist();
        els.entryInput.focus();
      });
      const removeBtn = document.createElement('button');
      removeBtn.className = 'wl-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.setAttribute('aria-label', `${w.symbol} 삭제`);
      removeBtn.addEventListener('click', async () => {
        removeBtn.disabled = true;
        const { error } = await supabase.from('watchlist').delete().eq('id', w.id);
        if (error) { removeBtn.disabled = false; els.watchlistMsg.textContent = '삭제 실패: ' + error.message; }
        else refetchWatchlist();
      });
      row.appendChild(useBtn);
      row.appendChild(removeBtn);
      els.watchlistList.appendChild(row);
    });
  }

  function setToday() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    els.dateInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  setToday();

  els.sideCtrl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-side]');
    if (!btn) return;
    state.currentSide = btn.dataset.side;
    els.sideCtrl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    updatePreview();
  });
  els.marginCtrl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-margin]');
    if (!btn) return;
    state.currentMargin = btn.dataset.margin;
    els.marginCtrl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  });

  els.leverageRange.addEventListener('input', () => { els.leverageInput.value = els.leverageRange.value; updatePreview(); });
  els.leverageInput.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, Number(els.leverageInput.value) || 0));
    els.leverageRange.value = v;
    updatePreview();
  });
  ['entryInput', 'exitInput', 'weightInput'].forEach((k) => els[k].addEventListener('input', updatePreview));

  function updatePreview() {
    const entry = parseFloat(els.entryInput.value);
    const exit = parseFloat(els.exitInput.value);
    const weight = parseFloat(els.weightInput.value);
    const leverage = parseFloat(els.leverageInput.value);
    if (!(entry > 0) || !(exit > 0) || isNaN(weight) || isNaN(leverage)) {
      els.previewValue.textContent = '—';
      els.previewValue.className = 'mono';
      return;
    }
    const r = calcTrade({ side: state.currentSide, entry, exit, weight, leverage }, state.capital);
    els.previewValue.textContent = `${fmtPct(r.pnlPct)}  (${fmtWon(r.pnlAmount)})`;
    els.previewValue.className = 'mono ' + (r.pnlPct > 0 ? 'good' : r.pnlPct < 0 ? 'bad' : '');
  }

  function renderStats() {
    const s = computeStats(state.trades, state.capital);
    if (!s) {
      els.statWinRate.textContent = '—'; els.statWinRate.className = 'stat-value';
      els.statWinRateSub.textContent = '거래 없음';
      els.statPLRatio.textContent = '—'; els.statPLRatioSub.textContent = '평균익 / 평균손';
      els.statPnlAmount.textContent = '—'; els.statPnlAmount.className = 'stat-value';
      els.statPnlAmountSub.textContent = '자본 대비 0%';
      els.statTotal.textContent = '0'; els.statTotalSub.textContent = '승 0 · 패 0';
      return;
    }
    els.statWinRate.textContent = (s.winRate * 100).toFixed(1) + '%';
    els.statWinRate.className = 'stat-value';
    els.statWinRateSub.textContent = `${s.wins}승 ${s.losses}패 (전체 ${s.total}건)`;
    els.statPLRatio.textContent = isFinite(s.plRatio) ? s.plRatio.toFixed(2) : '∞';
    els.statPLRatioSub.textContent = `평균익 ${fmtPct(s.avgWin)} / 평균손 ${fmtPct(-s.avgLoss)}`;
    els.statPnlAmount.textContent = fmtWon(s.cumAmount);
    els.statPnlAmount.className = 'stat-value ' + (s.cumAmount > 0 ? 'good' : s.cumAmount < 0 ? 'bad' : '');
    els.statPnlAmountSub.textContent = `자본 대비 ${fmtPct(s.cumPct)}`;
    els.statTotal.textContent = String(s.total);
    els.statTotalSub.textContent = `승 ${s.wins} · 패 ${s.losses}`;
  }

  function renderChart() {
    const asc = sortedAsc(state.trades);
    const svg = els.svg;
    svg.innerHTML = '';
    if (asc.length === 0) {
      els.chartEmpty.hidden = false;
      els.chartRange.textContent = '거래 없음';
      return;
    }
    els.chartEmpty.hidden = true;
    els.chartRange.textContent = `${asc[0].date} ~ ${asc[asc.length - 1].date} · ${asc.length}건`;

    let cum = 0;
    const points = [{ x: 0, y: 0, label: '시작' }];
    asc.forEach((t) => { cum += calcTrade(t, state.capital).pnlAmount; points.push({ x: points.length, y: cum, date: t.date }); });

    const W = 760, H = 220, padL = 54, padR = 16, padT = 16, padB = 26;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const ys = points.map((p) => p.y);
    let maxY = Math.max(...ys, 0), minY = Math.min(...ys, 0);
    if (maxY === minY) { maxY += 1; minY -= 1; }
    let span = maxY - minY;
    maxY += span * 0.08; minY -= span * 0.08; span = maxY - minY;

    const sx = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const sy = (v) => padT + innerH - ((v - minY) / span) * innerH;
    const zeroY = sy(0);

    const svgNS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs) => { const n = document.createElementNS(svgNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

    const cs = getComputedStyle(document.documentElement);
    const goodColor = cs.getPropertyValue('--good').trim() || '#0ca30c';
    const badColor = cs.getPropertyValue('--bad').trim() || '#d03b3b';
    const gridColor = cs.getPropertyValue('--grid-line').trim();
    const mutedColor = cs.getPropertyValue('--text-muted').trim();
    const accentColor = cs.getPropertyValue('--accent').trim();

    const defs = el('defs', {});
    const grad = el('linearGradient', { id: 'pnlFill', x1: '0', y1: padT, x2: '0', y2: padT + innerH, gradientUnits: 'userSpaceOnUse' });
    const clampOff = Math.max(0, Math.min(1, (zeroY - padT) / innerH));
    grad.appendChild(el('stop', { offset: '0', 'stop-color': goodColor, 'stop-opacity': '0.22' }));
    grad.appendChild(el('stop', { offset: String(clampOff), 'stop-color': goodColor, 'stop-opacity': '0.04' }));
    grad.appendChild(el('stop', { offset: String(clampOff), 'stop-color': badColor, 'stop-opacity': '0.04' }));
    grad.appendChild(el('stop', { offset: '1', 'stop-color': badColor, 'stop-opacity': '0.22' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    [0.25, 0.5, 0.75].forEach((f) => {
      const y = padT + innerH * f;
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: gridColor, 'stroke-width': '1' }));
    });

    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: zeroY, y2: zeroY, stroke: cs.getPropertyValue('--baseline').trim(), 'stroke-width': '1', 'stroke-dasharray': '4 3' }));
    const zeroLabel = el('text', { x: padL - 8, y: zeroY + 4, 'text-anchor': 'end', 'font-size': '10.5', fill: mutedColor, 'font-family': 'JetBrains Mono, monospace' });
    zeroLabel.textContent = '0';
    svg.appendChild(zeroLabel);

    const linePts = points.map((p, i) => `${sx(i)},${sy(p.y)}`);
    const areaD = `M${sx(0)},${zeroY} L${linePts.join(' L')} L${sx(points.length - 1)},${zeroY} Z`;
    svg.appendChild(el('path', { d: areaD, fill: 'url(#pnlFill)', stroke: 'none' }));
    svg.appendChild(el('path', { d: `M${linePts.join(' L')}`, fill: 'none', stroke: accentColor, 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    const last = points[points.length - 1];
    const lx = sx(points.length - 1), ly = sy(last.y);
    svg.appendChild(el('circle', { cx: lx, cy: ly, r: '4', fill: accentColor }));
    const lastLabel = el('text', { x: Math.min(lx, W - padR - 90), y: Math.max(padT + 10, ly - 10), 'font-size': '11.5', 'font-weight': '700', fill: last.y >= 0 ? goodColor : badColor, 'font-family': 'JetBrains Mono, monospace' });
    lastLabel.textContent = fmtWon(last.y);
    svg.appendChild(lastLabel);

    // hover crosshair
    const crosshair = el('line', { x1: 0, x2: 0, y1: padT, y2: padT + innerH, stroke: mutedColor, 'stroke-width': '1', opacity: '0' });
    const hoverDot = el('circle', { r: '4', fill: accentColor, opacity: '0' });
    const tipGroup = el('g', { opacity: '0' });
    const tipRect = el('rect', { rx: '5', ry: '5', height: '34' });
    const tipText1 = el('text', { 'font-size': '10.5', 'font-family': 'JetBrains Mono, monospace' });
    const tipText2 = el('text', { 'font-size': '11.5', 'font-weight': '700', 'font-family': 'JetBrains Mono, monospace' });
    tipGroup.appendChild(tipRect); tipGroup.appendChild(tipText1); tipGroup.appendChild(tipText2);
    svg.appendChild(crosshair); svg.appendChild(hoverDot); svg.appendChild(tipGroup);
    const hitRect = el('rect', { x: padL, y: padT, width: innerW, height: innerH, fill: 'transparent' });
    svg.appendChild(hitRect);

    function showHover(i) {
      const p = points[i];
      const px = sx(i), py = sy(p.y);
      crosshair.setAttribute('x1', px); crosshair.setAttribute('x2', px); crosshair.setAttribute('opacity', '0.4');
      hoverDot.setAttribute('cx', px); hoverDot.setAttribute('cy', py); hoverDot.setAttribute('opacity', '1');
      tipText1.textContent = p.label || p.date;
      tipText2.textContent = fmtWon(p.y);
      const bgColor = cs.getPropertyValue('--text-primary').trim();
      const fgColor = cs.getPropertyValue('--bg').trim();
      tipRect.setAttribute('fill', bgColor);
      tipText1.setAttribute('fill', fgColor); tipText1.setAttribute('opacity', '0.7');
      tipText2.setAttribute('fill', fgColor);
      const boxW = 92;
      const boxX = Math.min(Math.max(px - boxW / 2, padL), W - padR - boxW);
      const boxY = py > padT + innerH / 2 ? py - 44 : py + 10;
      tipRect.setAttribute('x', boxX); tipRect.setAttribute('y', boxY); tipRect.setAttribute('width', boxW);
      tipText1.setAttribute('x', boxX + 8); tipText1.setAttribute('y', boxY + 14);
      tipText2.setAttribute('x', boxX + 8); tipText2.setAttribute('y', boxY + 27);
      tipGroup.setAttribute('opacity', '1');
    }
    function hideHover() { crosshair.setAttribute('opacity', '0'); hoverDot.setAttribute('opacity', '0'); tipGroup.setAttribute('opacity', '0'); }
    hitRect.addEventListener('mousemove', (e) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      let idx = points.length === 1 ? 0 : Math.round(((mx - padL) / innerW) * (points.length - 1));
      idx = Math.max(0, Math.min(points.length - 1, idx));
      showHover(idx);
    });
    hitRect.addEventListener('mouseleave', hideHover);
  }

  function renderTable() {
    const desc = sortedAsc(state.trades).slice().reverse();
    els.tradeCount.textContent = `${desc.length}건`;
    els.tableEmpty.hidden = desc.length !== 0;
    els.tradeTbody.innerHTML = '';
    desc.forEach((t) => {
      const r = calcTrade(t, state.capital);
      const tr = document.createElement('tr');
      const td = (html, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.innerHTML = html; tr.appendChild(c); };
      td(t.date);
      td(escapeHtml(t.symbol || '—'), 'cell-symbol');
      td(`<span class="pill ${t.side === 'long' ? 'long' : 'short'}">${t.side === 'long' ? '롱' : '숏'}</span>`);
      td(fmtPrice(t.entry));
      td(fmtPrice(t.exit));
      td(Number(t.weight).toFixed(1) + '%');
      td(Number(t.leverage).toFixed(0) + 'x');
      td(`<span class="pill margin">${t.margin === 'isolated' ? '격리' : '교차'}</span>`);
      td(`<span class="num ${r.pnlPct > 0 ? 'good' : r.pnlPct < 0 ? 'bad' : ''}">${fmtPct(r.pnlPct)}</span>`);
      td(`<span class="num ${r.pnlAmount > 0 ? 'good' : r.pnlAmount < 0 ? 'bad' : ''}">${fmtWon(r.pnlAmount)}</span>`);
      td(r.pnlPct > 1e-12 ? '<span class="pill long">승</span>' : r.pnlPct < -1e-12 ? '<span class="pill short">패</span>' : '<span class="pill margin">무</span>');
      const actionTd = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn'; editBtn.type = 'button'; editBtn.textContent = '수정';
      editBtn.addEventListener('click', () => startEdit(t));
      const delBtn = document.createElement('button');
      delBtn.className = 'del-btn'; delBtn.type = 'button'; delBtn.textContent = '삭제'; delBtn.dataset.id = t.id;
      delBtn.addEventListener('click', () => handleDeleteClick(delBtn, t.id));
      actionTd.appendChild(editBtn);
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      els.tradeTbody.appendChild(tr);
    });
  }

  function startEdit(trade) {
    state.editingId = trade.id;
    els.dateInput.value = trade.date;
    els.symbolInput.value = trade.symbol;
    els.entryInput.value = trade.entry;
    els.exitInput.value = trade.exit;
    els.weightInput.value = trade.weight;
    els.leverageInput.value = trade.leverage;
    els.leverageRange.value = trade.leverage;
    els.memoInput.value = trade.memo || '';
    state.currentSide = trade.side;
    state.currentMargin = trade.margin;
    els.sideCtrl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.side === trade.side));
    els.marginCtrl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.margin === trade.margin));
    els.editingBanner.hidden = false;
    els.cancelEditBtn.hidden = false;
    els.submitBtn.textContent = '거래 수정';
    updatePreview();
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    state.editingId = null;
    els.form.reset();
    setToday();
    state.currentSide = 'long'; state.currentMargin = 'cross';
    els.sideCtrl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.side === 'long'));
    els.marginCtrl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.margin === 'cross'));
    els.leverageRange.value = 1; els.leverageInput.value = 1;
    els.editingBanner.hidden = true;
    els.cancelEditBtn.hidden = true;
    els.submitBtn.textContent = '거래 저장';
    els.formError.textContent = '';
    updatePreview();
  }
  els.cancelEditBtn.addEventListener('click', cancelEdit);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const deleteConfirmTimers = {};
  function handleDeleteClick(btn, id) {
    if (btn.classList.contains('confirm')) {
      clearTimeout(deleteConfirmTimers[id]);
      btn.disabled = true;
      supabase.from('trades').delete().eq('id', id).then(({ error }) => {
        if (error) { btn.disabled = false; els.formError.textContent = '삭제 실패: ' + error.message; }
        else refetchTrades();
      });
    } else {
      btn.classList.add('confirm');
      btn.textContent = '확인?';
      deleteConfirmTimers[id] = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = '삭제'; }, 2800);
    }
  }

  function renderAll() { renderStats(); renderChart(); renderTable(); renderWatchlist(); updatePreview(); }

  function formatCapitalDisplay() { els.capitalInput.value = state.capital.toLocaleString('ko-KR'); }
  els.capitalInput.addEventListener('focus', () => { els.capitalInput.value = String(state.capital); });
  els.capitalInput.addEventListener('blur', async () => {
    let n = parseInt(els.capitalInput.value.replace(/[^0-9]/g, ''), 10);
    if (!n || n <= 0) n = DEFAULT_CAPITAL;
    state.capital = n;
    formatCapitalDisplay();
    renderAll();
    await supabase.from('settings').upsert({ user_id: state.session.user.id, capital: n, updated_at: new Date().toISOString() });
  });

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.formError.textContent = '';
    const data = {
      user_id: state.session.user.id,
      date: els.dateInput.value,
      symbol: (els.symbolInput.value || '').trim().toUpperCase(),
      side: state.currentSide,
      entry: parseFloat(els.entryInput.value),
      exit: parseFloat(els.exitInput.value),
      weight: parseFloat(els.weightInput.value),
      leverage: parseFloat(els.leverageInput.value),
      margin: state.currentMargin,
      memo: (els.memoInput.value || '').trim(),
    };
    if (!data.date) { els.formError.textContent = '날짜를 입력해주세요.'; return; }
    if (!data.symbol) { els.formError.textContent = '종목을 입력해주세요.'; return; }
    if (!(data.entry > 0)) { els.formError.textContent = '매수단가는 0보다 커야 합니다.'; return; }
    if (!(data.exit > 0)) { els.formError.textContent = '매도단가는 0보다 커야 합니다.'; return; }
    if (isNaN(data.weight) || data.weight < 0 || data.weight > 100) { els.formError.textContent = '비중은 0~100 사이여야 합니다.'; return; }
    if (isNaN(data.leverage) || data.leverage < 0 || data.leverage > 100) { els.formError.textContent = '배율은 0~100 사이여야 합니다.'; return; }

    const isEditing = !!state.editingId;
    els.submitBtn.disabled = true; els.submitBtn.textContent = isEditing ? '수정 중…' : '저장 중…';
    const { error } = isEditing
      ? await supabase.from('trades').update(data).eq('id', state.editingId)
      : await supabase.from('trades').insert(data);
    els.submitBtn.disabled = false;
    if (error) { els.submitBtn.textContent = isEditing ? '거래 수정' : '거래 저장'; els.formError.textContent = (isEditing ? '수정 실패: ' : '저장 실패: ') + error.message; return; }

    cancelEdit();
    refetchTrades();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderChart);

  formatCapitalDisplay();
  renderAll();

  // expose a re-render hook so top-level loadData()/refetchTrades() can refresh this instance
  window.__renderAll = renderAll;
  window.__formatCapital = formatCapitalDisplay;
}
