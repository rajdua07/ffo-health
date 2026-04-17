"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  AppData, Client, Score, Wow, Referral, ClientStat, UserProfile, Settings,
  NPSFeedback, Pod, ExecSummary, ScoringConfig,
  loadData, saveData, calcScore, dimAvg, getStatus, sColor, getFee, fmtM, timeAgo,
  getNextAnniversary, canScore, canEdit, canExport, canViewAllAdvisors, canConfigureScoring,
  filterByAdvisor, getReferralSources,
  syncFromWealthbox, pushScoreToWealthbox, testWealthboxConnection,
  importNewClientsFromWealthbox, enrichClientsWithTasks, fetchExecSummary, fetchAIScore,
  generateNPSSurveyLink, fetchPendingNPSSurveys, parseCSVClients,
  npsCategory, npsColor, latestNPSForClient, getPods, getPodForClient,
  getThresholds, getEffectiveWeights,
  METRICS, METRIC_COUNT, DIMENSIONS, DIM_WEIGHTS, MO, QUARTERS, quarterFromMonth, quarterStartMonth, quarterEndMonth,
  TIERS, ADVISORS, WOW_TYPES,
  REFERRAL_SOURCES, NPS_SOURCES, CADENCE_DAYS, SCORING_FREQUENCY, TIER_REVENUE, DEFAULT_USERS,
  DEFAULT_CLIENTS, DEFAULT_SCORES, DEFAULT_WOWS, DEFAULT_REFERRALS, DEFAULT_NPS, DEFAULT_PODS
} from "@/lib/data";
import { exportClientPDF, exportPortfolioPDF } from "@/lib/pdf";

// ===== SHARED UI =====
function Badge({ status, sm }: { status: string | null; sm?: boolean }) {
  const c = sColor(status);
  return <span className={`${sm ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"} rounded-full font-semibold inline-block`}
    style={{ background: c.bg, color: c.tx, border: `1px solid ${c.bd}` }}>{status || "\u2014"}</span>;
}

function ScoreCircle({ score, size = 44, settings }: { score: number | null; size?: number; settings?: Settings }) {
  if (score == null) return <div style={{ width: size, height: size }} className="rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">{"\u2014"}</div>;
  const c = sColor(getStatus(score, settings));
  return <div style={{ width: size, height: size, background: c.bg, border: `2px solid ${c.bd}` }} className="rounded-full flex items-center justify-center font-bold">
    <span style={{ color: c.tx, fontSize: size * 0.35 }}>{score.toFixed(1)}</span>
  </div>;
}

function MiniBar({ value }: { value: number | null }) {
  const v = Number(value) || 0;
  const pct = Math.max(0, Math.min(100, (v / 10) * 100));
  const col = v >= 7 ? "#22c55e" : v >= 5 ? "#eab308" : "#ef4444";
  return <div className="flex items-center gap-2 w-full">
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} /></div>
    <span className="text-xs font-mono w-6 text-right" style={{ color: col }}>{v.toFixed(1)}</span>
  </div>;
}

function TrendArrow({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return <span className="text-gray-300 text-xs">{"\u2014"}</span>;
  if (cur > prev) return <span className="text-green-600 text-sm font-bold">{"\u25B2"}</span>;
  if (cur < prev) return <span className="text-red-500 text-sm font-bold">{"\u25BC"}</span>;
  return <span className="text-gray-400 text-sm">{"\u25CF"}</span>;
}

function Sel({ label, value, onChange, options, display, darkMode }: { label?: string; value: string; onChange: (v: string) => void; options: string[]; display?: string[]; darkMode?: boolean }) {
  return <div className="flex items-center gap-1.5">
    {label && <span className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{label}:</span>}
    <select className={`border rounded-lg px-2 py-1.5 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={value} onChange={e => onChange(e.target.value)}>
      {options.map((o, i) => <option key={o} value={o}>{display ? display[i] : o}</option>)}
    </select>
  </div>;
}

function StatCard({ label, value, color = "#111", sub, darkMode }: { label: string; value: string | number; color?: string; sub?: string; darkMode?: boolean }) {
  return <div className={`rounded-xl border p-2.5 sm:p-3.5 text-center shadow-sm ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100"}`}>
    <div className="text-xl sm:text-2xl font-bold" style={{ color: darkMode ? "#ffffff" : color }}>{value}</div>
    <div className={`text-[10px] sm:text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{label}</div>
    {sub && <div className={`text-[10px] sm:text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{sub}</div>}
  </div>;
}

// ===== IMPORT DIALOG =====
function ImportDialog({
  clients,
  onConfirm,
  onCancel,
  darkMode
}: {
  clients: Client[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
  darkMode?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(clients.map(c => c.id)));

  const toggleClient = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === clients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clients.map(c => c.id)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className={`rounded-xl border shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
        {/* Header */}
        <div className={`p-4 border-b ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
          <h3 className={`text-lg font-bold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
            Select Clients to Import
          </h3>
          <p className={`text-sm mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
            Found {clients.length} new client{clients.length === 1 ? '' : 's'} from Wealthbox
          </p>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <button
              onClick={toggleAll}
              className={`text-sm font-medium ${darkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"}`}
            >
              {selected.size === clients.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="space-y-2">
            {clients.map((client) => (
              <label
                key={client.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(client.id)
                    ? darkMode
                      ? "bg-blue-900 border-blue-700"
                      : "bg-blue-50 border-blue-200"
                    : darkMode
                    ? "bg-slate-700 border-slate-600 hover:bg-slate-650"
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(client.id)}
                  onChange={() => toggleClient(client.id)}
                  className="mt-1 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                    {client.name}
                  </div>
                  <div className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {client.tier} {"\u2022"} {client.leadAdvisor} {"\u2022"} {fmtM(client.monthlyFee)}/mo
                  </div>
                  {client.referralSource && (
                    <div className={`text-xs mt-0.5 ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
                      Source: {client.referralSource}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex gap-3 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
          <button
            onClick={onCancel}
            className={`flex-1 px-4 py-2 rounded-lg font-medium ${
              darkMode
                ? "bg-slate-700 text-gray-200 hover:bg-slate-600"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
            className={`flex-1 px-4 py-2 rounded-lg font-medium ${
              selected.size === 0
                ? "opacity-50 cursor-not-allowed bg-blue-600 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Import {selected.size} Client{selected.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== TABS =====
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "pods", label: "Pods" }, { id: "team", label: "Team" },
  { id: "compliance", label: "Compliance" },
  { id: "alerts", label: "Alerts" }, { id: "revenue", label: "Revenue" },
  { id: "activity", label: "Activity" },
  { id: "nps", label: "NPS" },
  { id: "settings", label: "Settings" },
];

function TabNav({ active, onChange, alertCount, darkMode }: { active: string; onChange: (t: string) => void; alertCount: number; darkMode?: boolean }) {
  return <div className={`flex gap-0.5 sm:gap-1 overflow-x-auto pb-1 mb-4 border-b -mx-3 sm:mx-0 px-3 sm:px-0 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
    {TABS.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg whitespace-nowrap ${active === t.id
          ? darkMode ? "bg-slate-800 border border-b-slate-800 border-slate-600 text-blue-400 -mb-px" : "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px"
          : darkMode ? "text-gray-400 hover:text-gray-200 hover:bg-slate-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
        {t.label}
        {t.id === "alerts" && alertCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-red-500 text-white font-bold">{alertCount}</span>}
      </button>
    ))}
  </div>;
}

// ===== useClientStats =====
function useClientStats(clients: Client[], scores: Score[], npsFeedback?: NPSFeedback[], settings?: Settings): ClientStat[] {
  return useMemo(() => (clients || []).map(client => {
    const cs = (scores || []).filter(s => s.clientId === client.id).sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
    const latest = cs[0] || null; const prev = cs[1] || null;
    const latestScore = latest ? calcScore(latest.scores) : null;
    const prevScore = prev ? calcScore(prev.scores) : null;
    const status = getStatus(latestScore, settings);
    const prevStatus = prev ? getStatus(calcScore(prev.scores), settings) : null;
    const dims = latest ? DIMENSIONS.map(d => ({ name: d, avg: dimAvg(latest.scores, d) })) : [];
    const dropped = !!(prevStatus && status && prevStatus === "HEALTHY" && (status === "WATCH" || status === "AT RISK"));
    const anniv = getNextAnniversary(client.onboardDate);
    const latestNPS = latestNPSForClient(npsFeedback || [], client.id);
    return { ...client, monthlyFee: getFee(client), latestScore, prevScore, status, prevStatus, latest, dims, scoreCount: cs.length, lastScoredTs: latest?.ts || null, dropped, anniversaryDays: anniv?.days ?? null, nextAnniversary: anniv?.date ?? null, latestNPS };
  }), [clients, scores, npsFeedback, settings]);
}

// ===== OVERVIEW =====
function OverviewTab({ stats, onSelect, onAdd, user, darkMode, settings }: { stats: ClientStat[]; onSelect: (id: string) => void; onAdd: () => void; user?: UserProfile; darkMode?: boolean; settings?: Settings }) {
  const [search, setSearch] = useState(""); const [fT, setFT] = useState("All"); const [fP, setFP] = useState("All"); const [fS, setFS] = useState("All");
  const [sortBy, setSortBy] = useState("Score (Low to High)");
  const pods = getPods(settings);

  const filtered = stats.filter(c => {
    if (fT !== "All" && c.tier !== fT) return false;
    if (fP !== "All") { const cp = getPodForClient(c, settings); if (!cp || cp.id !== fP) return false; }
    if (fS !== "All" && c.status !== fS) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const scored = filtered.filter(c => c.latestScore != null);
  const avg = scored.length ? scored.reduce((s, c) => s + (c.latestScore || 0), 0) / scored.length : 0;
  const h = scored.filter(c => c.status === "HEALTHY").length;
  const w = scored.filter(c => c.status === "WATCH").length;
  const r = scored.filter(c => c.status === "AT RISK").length;
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Clients" value={filtered.length} darkMode={darkMode} />
      <StatCard label="Monthly Rev" value={fmtM(filtered.reduce((s, c) => s + c.monthlyFee, 0))} color="#1B2A4A" darkMode={darkMode} />
      <StatCard label="Avg Score" value={avg.toFixed(1)} color={sColor(getStatus(avg, settings)).tx} darkMode={darkMode} />
      <StatCard label="Healthy" value={h} color="#166534" sub={scored.length ? `${Math.round(h / scored.length * 100)}%` : ""} darkMode={darkMode} />
      <StatCard label="Watch" value={w} color="#854d0e" sub={scored.length ? `${Math.round(w / scored.length * 100)}%` : ""} darkMode={darkMode} />
      <StatCard label="At Risk" value={r} color="#991b1b" sub={scored.length ? `${Math.round(r / scored.length * 100)}%` : ""} darkMode={darkMode} />
      <StatCard label="Unscored" value={filtered.length - scored.length} color="#6b7280" darkMode={darkMode} />
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <input className={`border rounded-lg px-3 py-1.5 text-sm w-full sm:flex-1 sm:min-w-48 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-400" : "border-gray-200 bg-white"}`} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
        <Sel label="Tier" value={fT} onChange={setFT} options={["All", ...TIERS]} darkMode={darkMode} />
        <Sel label="Pod" value={fP} onChange={setFP} options={["All", ...pods.map(p => p.id)]} display={["All", ...pods.map(p => p.name)]} darkMode={darkMode} />
        <Sel label="Status" value={fS} onChange={setFS} options={["All", "HEALTHY", "WATCH", "AT RISK"]} darkMode={darkMode} />
        <Sel label="Sort By" value={sortBy} onChange={setSortBy} options={["Score (Low to High)", "Score (High to Low)", "Name (A-Z)", "Name (Z-A)", "Revenue (High to Low)", "Revenue (Low to High)", "Onboard Date (Newest)", "Onboard Date (Oldest)"]} darkMode={darkMode} />
      </div>
      {canEdit(user) && <button onClick={onAdd} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 w-full sm:w-auto">+ Add Client</button>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.sort((a, b) => {
        if (sortBy === "Score (Low to High)") return (a.latestScore || 99) - (b.latestScore || 99);
        if (sortBy === "Score (High to Low)") return (b.latestScore || 0) - (a.latestScore || 0);
        if (sortBy === "Name (A-Z)") return a.name.localeCompare(b.name);
        if (sortBy === "Name (Z-A)") return b.name.localeCompare(a.name);
        if (sortBy === "Revenue (High to Low)") return b.monthlyFee - a.monthlyFee;
        if (sortBy === "Revenue (Low to High)") return a.monthlyFee - b.monthlyFee;
        if (sortBy === "Onboard Date (Newest)") return new Date(b.onboardDate).getTime() - new Date(a.onboardDate).getTime();
        if (sortBy === "Onboard Date (Oldest)") return new Date(a.onboardDate).getTime() - new Date(b.onboardDate).getTime();
        return 0;
      }).map(c => (
        <div key={c.id} onClick={() => onSelect(c.id)} className={`rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all group ${darkMode ? "bg-slate-800 border-slate-700 hover:border-blue-500" : "bg-white border-gray-200 hover:border-blue-300"}`}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold truncate group-hover:text-blue-600 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>{c.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? "bg-slate-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{c.tier}</span>
                <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{(() => { const p = getPodForClient(c, settings); return p ? p.name : c.leadAdvisor; })()}</span>
                <span className={`text-xs font-medium ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{fmtM(c.monthlyFee)}/mo</span>
              </div>
            </div>
            <ScoreCircle score={c.latestScore} size={42} settings={settings} />
          </div>
          <div className="flex items-center justify-between">
            <Badge status={c.status} sm />
            <div className="flex items-center gap-2">
              {c.anniversaryDays != null && c.anniversaryDays <= 30 && <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{"🎂"} {c.anniversaryDays}d</span>}
              <TrendArrow cur={c.latestScore} prev={c.prevScore} />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

// ===== BASELINE SCORING WORKFLOW =====
function BaselineTab({ stats, onScoreClient, darkMode, settings }: { stats: ClientStat[]; onScoreClient: (id: string) => void; darkMode?: boolean; settings?: Settings }) {
  const [filterUnscored, setFilterUnscored] = useState(false);
  const displayed = filterUnscored ? stats.filter(c => c.scoreCount === 0) : stats;
  const totalClients = stats.length;
  const baselinedCount = stats.filter(c => c.scoreCount > 0).length;
  const pct = totalClients > 0 ? Math.round((baselinedCount / totalClients) * 100) : 0;

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total Clients" value={totalClients} darkMode={darkMode} />
      <StatCard label="Baselined" value={baselinedCount} color="#166534" darkMode={darkMode} />
      <StatCard label="Remaining" value={totalClients - baselinedCount} color="#991b1b" darkMode={darkMode} />
      <StatCard label="Progress" value={`${pct}%`} color="#1B2A4A" darkMode={darkMode} />
    </div>

    {/* Progress Bar */}
    <div className={`rounded-xl border p-4 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-sm font-semibold ${darkMode ? "text-gray-300" : "text-gray-700"}`}>Baseline Progress: {baselinedCount} of {totalClients} clients</span>
        <span className={`text-sm font-bold ${pct === 100 ? "text-green-600" : darkMode ? "text-gray-300" : "text-gray-700"}`}>{pct}%</span>
      </div>
      <div className={`h-4 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-gray-100"}`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : "#3b82f6" }} />
      </div>
    </div>

    <div className="flex gap-2 items-center">
      <label className={`flex items-center gap-2 text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
        <input type="checkbox" checked={filterUnscored} onChange={e => setFilterUnscored(e.target.checked)} className="rounded" />
        No baseline yet only
      </label>
    </div>

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>CLIENT BASELINE STATUS</h3>
      {displayed.length === 0 ? <p className={`text-sm text-center py-4 ${darkMode ? "text-gray-400" : "text-gray-400"}`}>All clients have been baselined!</p> :
        <div className="space-y-1">
          {displayed.map(c => (
            <div key={c.id} className={`flex items-center gap-3 py-2 px-2 rounded-lg ${darkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"}`}>
              <div className={`w-44 truncate text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</div>
              <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? "bg-slate-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{c.tier}</span>
              <span className={`text-xs w-14 ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{c.leadAdvisor}</span>
              {c.scoreCount > 0
                ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">Scored ({c.scoreCount}x)</span>
                : <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">No baseline</span>}
              {c.baselineCompletedAt && <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{timeAgo(c.baselineCompletedAt)}</span>}
              <div className="flex-1" />
              <button onClick={() => onScoreClient(c.id)} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700">
                {c.scoreCount > 0 ? "Re-score" : "Score"}
              </button>
            </div>
          ))}
        </div>}
    </div>
  </div>;
}

// ===== RANKING =====
function RankingTab({ clients, scores, onSelect, darkMode, settings }: { clients: Client[]; scores: Score[]; onSelect: (id: string) => void; darkMode?: boolean; settings?: Settings }) {
  const [period, setPeriod] = useState("latest"); const [sortDir, setSortDir] = useState("asc"); const [fT, setFT] = useState("All"); const [fA, setFA] = useState("All");
  const ranked = useMemo(() => {
    const now = new Date(); const tY = now.getFullYear(); const tM = now.getMonth();
    return clients.filter(c => (fT === "All" || c.tier === fT) && (fA === "All" || c.leadAdvisor === fA)).map(c => {
      let rs: Score[];
      if (period === "latest") { const sorted = scores.filter(x => x.clientId === c.id).sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month)); rs = sorted.length ? [sorted[0]] : []; }
      else { let fY = tY, fM = 0; if (period === "3m") { const d = new Date(tY, tM - 2, 1); fY = d.getFullYear(); fM = d.getMonth(); } rs = scores.filter(x => x.clientId === c.id && (x.year * 12 + x.month) >= fY * 12 + fM); }
      const ws = rs.map(x => calcScore(x.scores)).filter((v): v is number => v != null);
      const avg = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
      return { ...c, monthlyFee: getFee(c), avgScore: avg };
    }).filter(c => c.avgScore != null).sort((a, b) => sortDir === "asc" ? (a.avgScore || 0) - (b.avgScore || 0) : (b.avgScore || 0) - (a.avgScore || 0));
  }, [clients, scores, period, sortDir, fT, fA]);

  return <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>CLIENT RANKING</h3>
      <div className="flex gap-2 flex-wrap">
        <Sel label="Tier" value={fT} onChange={setFT} options={["All", ...TIERS]} darkMode={darkMode} />
        <Sel label="Advisor" value={fA} onChange={setFA} options={["All", ...ADVISORS]} darkMode={darkMode} />
        <Sel label="Period" value={period} onChange={setPeriod} options={["latest", "3m", "ytd"]} darkMode={darkMode} />
        <button onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")} className={`border rounded-lg px-3 py-1.5 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 hover:bg-slate-600" : "border-gray-200 bg-white hover:bg-gray-50"}`}>{sortDir === "asc" ? "\u2191 Worst" : "\u2193 Best"}</button>
      </div>
    </div>
    {ranked.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No scored clients.</p> :
      <div className="space-y-1">{ranked.map((c, i) => {
        const col = sColor(getStatus(c.avgScore, settings)); const pct = ((c.avgScore || 0) / 10) * 100;
        return <div key={c.id} className={`flex items-center gap-2 group cursor-pointer rounded-lg px-1 py-1 ${darkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"}`} onClick={() => onSelect(c.id)}>
          <div className={`w-5 text-xs text-right font-mono shrink-0 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{i + 1}</div>
          <div className={`w-36 shrink-0 truncate text-sm font-medium group-hover:text-blue-600 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</div>
          <div className="flex-1 relative h-5"><div className={`absolute inset-0 rounded ${darkMode ? "bg-slate-700" : "bg-gray-50"}`} /><div className="absolute top-1 bottom-1 rounded-r-md" style={{ width: `${pct}%`, background: col.bd, minWidth: 4 }} /></div>
          <span className="w-10 text-right text-sm font-bold shrink-0" style={{ color: col.tx }}>{(c.avgScore || 0).toFixed(1)}</span>
          <div className="w-16 shrink-0"><Badge status={getStatus(c.avgScore, settings)} sm /></div>
        </div>;
      })}</div>}
  </div>;
}

// ===== ADVISORS =====
function AdvisorTab({ stats, darkMode, settings }: { stats: ClientStat[]; darkMode?: boolean; settings?: Settings }) {
  const data = useMemo(() => ADVISORS.map(adv => {
    const cs = stats.filter(c => c.leadAdvisor === adv); const scored = cs.filter(c => c.latestScore != null);
    const avg = scored.length ? scored.reduce((s, c) => s + (c.latestScore || 0), 0) / scored.length : 0;
    const h = scored.filter(c => c.status === "HEALTHY").length; const w = scored.filter(c => c.status === "WATCH").length; const r = scored.filter(c => c.status === "AT RISK").length;
    const totalRev = cs.reduce((s, c) => s + c.monthlyFee, 0); const atRiskRev = cs.filter(c => c.status === "AT RISK" || c.status === "WATCH").reduce((s, c) => s + c.monthlyFee, 0);
    const dims = DIMENSIONS.map(d => { const vals = scored.map(c => (c.dims.find(x => x.name === d) || { avg: null }).avg).filter((v): v is number => v != null); return { name: d, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 }; });
    return { adv, total: cs.length, scored: scored.length, avg, h, w, r, totalRev, atRiskRev, dims };
  }), [stats]);

  return <div className="grid gap-4 sm:grid-cols-2">
    {data.map(a => (
      <div key={a.adv} className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
        <div className="flex items-center justify-between mb-4"><h3 className={`text-lg font-bold ${darkMode ? "text-gray-100" : ""}`} style={{ color: darkMode ? undefined : "#1B2A4A" }}>{a.adv}</h3><ScoreCircle score={a.avg} size={52} settings={settings} /></div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 rounded-lg bg-green-50"><div className="text-xl font-bold text-green-800">{a.h}</div><div className="text-[10px] text-green-600">Healthy</div></div>
          <div className="text-center p-2 rounded-lg bg-amber-50"><div className="text-xl font-bold text-amber-800">{a.w}</div><div className="text-[10px] text-amber-600">Watch</div></div>
          <div className="text-center p-2 rounded-lg bg-red-50"><div className="text-xl font-bold text-red-800">{a.r}</div><div className="text-[10px] text-red-600">At Risk</div></div>
        </div>
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-sm"><span className={darkMode ? "text-gray-400" : "text-gray-500"}>Clients</span><span className={`font-semibold ${darkMode ? "text-gray-200" : ""}`}>{a.total}</span></div>
          <div className="flex justify-between text-sm"><span className={darkMode ? "text-gray-400" : "text-gray-500"}>Revenue</span><span className={`font-semibold ${darkMode ? "text-gray-200" : ""}`}>{fmtM(a.totalRev)}/mo</span></div>
          <div className="flex justify-between text-sm"><span className={darkMode ? "text-gray-400" : "text-gray-500"}>At Risk Rev</span><span className="font-semibold text-red-600">{fmtM(a.atRiskRev)}</span></div>
        </div>
        <h4 className={`text-xs font-semibold mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>DIMENSIONS</h4>
        {a.dims.map(d => <div key={d.name} className="flex items-center gap-2"><span className={`text-xs w-24 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{d.name}</span><MiniBar value={d.avg} /></div>)}
      </div>
    ))}
  </div>;
}

// ===== PODS =====
function PodsTab({ stats, onSelect, darkMode, settings, onSaveSettings }: { stats: ClientStat[]; onSelect: (id: string) => void; darkMode?: boolean; settings?: Settings; onSaveSettings?: (s: Settings) => void }) {
  const [expandedPod, setExpandedPod] = useState<string | null>(null);
  const [editingPod, setEditingPod] = useState<Pod | null>(null);
  const [showPodForm, setShowPodForm] = useState(false);
  const pods = getPods(settings);

  // Pod form state
  const [podName, setPodName] = useState("");
  const [podAdvisor, setPodAdvisor] = useState("");
  const [podWp, setPodWp] = useState("");
  const [podWpa, setPodWpa] = useState("");
  const [podPartner, setPodPartner] = useState("");

  const openEditPod = (pod: Pod) => {
    setEditingPod(pod);
    setPodName(pod.name);
    setPodAdvisor(pod.advisor || pod.advisors?.[0] || "");
    setPodWp(pod.wp || "");
    setPodWpa(pod.wpa || "");
    setPodPartner(pod.partner || "");
    setShowPodForm(true);
  };

  const openAddPod = () => {
    setEditingPod(null);
    setPodName("");
    setPodAdvisor("");
    setPodWp("");
    setPodWpa("");
    setPodPartner("");
    setShowPodForm(true);
  };

  const savePod = () => {
    if (!podName.trim() || !podAdvisor.trim() || !podWp.trim() || !podWpa.trim() || !onSaveSettings) return;
    const currentPods = [...(settings?.pods || DEFAULT_PODS)];

    const podObj: Pod = { id: editingPod?.id || ("pod" + Date.now()), name: podName.trim(), advisor: podAdvisor.trim(), wp: podWp.trim(), wpa: podWpa.trim(), partner: podPartner.trim() || undefined };

    if (editingPod) {
      const idx = currentPods.findIndex(p => p.id === editingPod.id);
      if (idx >= 0) currentPods[idx] = podObj;
    } else {
      currentPods.push(podObj);
    }

    onSaveSettings({ ...settings, referralSources: settings?.referralSources || REFERRAL_SOURCES, pods: currentPods });
    setShowPodForm(false);
    setEditingPod(null);
  };

  const deletePod = (podId: string) => {
    if (!onSaveSettings) return;
    const currentPods = (settings?.pods || DEFAULT_PODS).filter(p => p.id !== podId);
    onSaveSettings({ ...settings, referralSources: settings?.referralSources || REFERRAL_SOURCES, pods: currentPods });
  };

  const podData = useMemo(() => pods.map(pod => {
    const podClients = stats.filter(c => {
      const cp = getPodForClient(c, settings);
      return cp?.id === pod.id;
    });
    const scored = podClients.filter(c => c.latestScore != null);
    const avgScore = scored.length ? scored.reduce((s, c) => s + (c.latestScore || 0), 0) / scored.length : 0;
    const totalMRR = podClients.reduce((s, c) => s + c.monthlyFee, 0);
    const atRiskRev = podClients.filter(c => c.status === "AT RISK" || c.status === "WATCH").reduce((s, c) => s + c.monthlyFee, 0);
    const hCount = scored.filter(c => c.status === "HEALTHY").length;
    const wCount = scored.filter(c => c.status === "WATCH").length;
    const rCount = scored.filter(c => c.status === "AT RISK").length;
    const overallHealth = scored.length === 0 ? null : avgScore >= (getThresholds(settings).watch) ? "HEALTHY" : avgScore >= (getThresholds(settings).atRisk) ? "WATCH" : "AT RISK";
    return { pod, clients: podClients, scored: scored.length, avgScore, totalMRR, atRiskRev, hCount, wCount, rCount, overallHealth };
  }), [stats, pods, settings]);

  if (showPodForm) {
    return <div className="space-y-4">
      <button onClick={() => setShowPodForm(false)} className="text-sm text-blue-600 hover:text-blue-800">{"\u2190"} Back to Pods</button>
      <div className={`rounded-xl border p-4 sm:p-5 max-w-md ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
        <h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>{editingPod ? "Edit Pod" : "Create Pod"}</h2>
        <div className="space-y-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Pod Name *</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={podName} onChange={e => setPodName(e.target.value)} placeholder="e.g. Pod Alpha" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Advisor *</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={podAdvisor} onChange={e => setPodAdvisor(e.target.value)} placeholder="e.g. Landon" /></div>
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>WP (Wealth Planner) *</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={podWp} onChange={e => setPodWp(e.target.value)} placeholder="e.g. Josh" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>WPA (Wealth Planner Assistant) *</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={podWpa} onChange={e => setPodWpa(e.target.value)} placeholder="e.g. Thea" /></div>
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Partner (optional)</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={podPartner} onChange={e => setPodPartner(e.target.value)} placeholder="e.g. Sarah" /></div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={savePod} disabled={!podName.trim() || !podAdvisor.trim() || !podWp.trim() || !podWpa.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save Pod</button>
          <button onClick={() => setShowPodForm(false)} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Cancel</button>
        </div>
      </div>
    </div>;
  }

  return <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 flex-1">
        <StatCard label="Total Pods" value={pods.length} darkMode={darkMode} />
        <StatCard label="Total MRR" value={fmtM(podData.reduce((s, p) => s + p.totalMRR, 0))} color="#1B2A4A" darkMode={darkMode} />
        <StatCard label="Avg Score" value={(() => { const allScored = podData.filter(p => p.scored > 0); return allScored.length ? (allScored.reduce((s, p) => s + p.avgScore, 0) / allScored.length).toFixed(1) : "0.0"; })()} darkMode={darkMode} />
        <StatCard label="Rev at Risk" value={fmtM(podData.reduce((s, p) => s + p.atRiskRev, 0))} color="#991b1b" darkMode={darkMode} />
      </div>
    </div>

    <div className="flex justify-end">
      <button onClick={openAddPod} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">+ Add Pod</button>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      {podData.map(pd => {
        const healthCol = pd.overallHealth === "HEALTHY" ? { border: "border-green-300", bg: darkMode ? "bg-green-900/20" : "bg-green-50" }
          : pd.overallHealth === "WATCH" ? { border: "border-amber-300", bg: darkMode ? "bg-amber-900/20" : "bg-amber-50" }
          : pd.overallHealth === "AT RISK" ? { border: "border-red-300", bg: darkMode ? "bg-red-900/20" : "bg-red-50" }
          : { border: darkMode ? "border-slate-700" : "border-gray-200", bg: "" };
        return <div key={pd.pod.id} className={`rounded-xl border-2 ${healthCol.border} p-4 sm:p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className={`text-lg font-bold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>{pd.pod.name}</h3>
              <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Advisor: {pd.pod.advisor || pd.pod.advisors?.join(", ")} | WP: {pd.pod.wp || "—"} | WPA: {pd.pod.wpa || "—"}{pd.pod.partner ? ` | Partner: ${pd.pod.partner}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openEditPod(pd.pod)} className={`text-xs px-2 py-1 rounded ${darkMode ? "text-gray-400 hover:text-blue-400 hover:bg-slate-700" : "text-gray-400 hover:text-blue-600 hover:bg-gray-100"}`}>{"\u270E"}</button>
              <ScoreCircle score={pd.scored > 0 ? pd.avgScore : null} size={48} settings={settings} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center p-1.5 rounded-lg bg-green-50"><div className="text-lg font-bold text-green-800">{pd.hCount}</div><div className="text-[10px] text-green-600">Healthy</div></div>
            <div className="text-center p-1.5 rounded-lg bg-amber-50"><div className="text-lg font-bold text-amber-800">{pd.wCount}</div><div className="text-[10px] text-amber-600">Watch</div></div>
            <div className="text-center p-1.5 rounded-lg bg-red-50"><div className="text-lg font-bold text-red-800">{pd.rCount}</div><div className="text-[10px] text-red-600">At Risk</div></div>
          </div>
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-sm"><span className={darkMode ? "text-gray-400" : "text-gray-500"}>Clients</span><span className={`font-semibold ${darkMode ? "text-gray-200" : ""}`}>{pd.clients.length}</span></div>
            <div className="flex justify-between text-sm"><span className={darkMode ? "text-gray-400" : "text-gray-500"}>Total MRR</span><span className={`font-semibold ${darkMode ? "text-gray-200" : ""}`}>{fmtM(pd.totalMRR)}/mo</span></div>
            <div className="flex justify-between text-sm"><span className={darkMode ? "text-gray-400" : "text-gray-500"}>Rev at Risk</span><span className="font-semibold text-red-600">{fmtM(pd.atRiskRev)}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setExpandedPod(expandedPod === pd.pod.id ? null : pd.pod.id)} className={`text-xs font-medium ${darkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"}`}>
              {expandedPod === pd.pod.id ? "Hide clients" : `Show ${pd.clients.length} clients`}
            </button>
            {pd.clients.length === 0 && <button onClick={() => deletePod(pd.pod.id)} className="text-xs text-red-500 hover:text-red-700">Delete pod</button>}
          </div>
          {expandedPod === pd.pod.id && <div className="mt-3 space-y-1 border-t pt-2">
            {pd.clients.map(c => (
              <div key={c.id} className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer ${darkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"}`} onClick={() => onSelect(c.id)}>
                <span className={`text-sm font-medium flex-1 truncate ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</span>
                <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{fmtM(c.monthlyFee)}/mo</span>
                <Badge status={c.status} sm />
              </div>
            ))}
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

// ===== TEAM =====
function TeamTab({ stats, onSelect, darkMode, settings }: { stats: ClientStat[]; onSelect: (id: string) => void; darkMode?: boolean; settings?: Settings }) {
  const teamData = useMemo(() => {
    const pods = getPods(settings);
    // A role string can hold multiple names like "Misha + Alex" — split on + or &
    const splitNames = (s?: string): string[] => {
      if (!s) return [];
      return s.split(/\s*[+&]\s*/).map(n => n.trim()).filter(Boolean);
    };

    // Collect all unique team members from pod definitions (expanding multi-person roles)
    const teamMembers = new Map<string, ClientStat[]>();
    const allNames = new Set<string>();
    for (const pod of pods) {
      splitNames(pod.advisor).forEach(n => allNames.add(n));
      splitNames(pod.wp).forEach(n => allNames.add(n));
      splitNames(pod.wpa).forEach(n => allNames.add(n));
      splitNames(pod.partner).forEach(n => allNames.add(n));
    }
    Array.from(allNames).forEach(name => teamMembers.set(name, []));

    // Assign clients to every individual appearing in the pod's roles
    for (const c of stats) {
      if (!c.pod) continue; // skip clients not assigned to a pod
      const cp = pods.find(p => p.id === c.pod);
      if (!cp) continue;
      const podMembers = [
        ...splitNames(cp.advisor),
        ...splitNames(cp.wp),
        ...splitNames(cp.wpa),
        ...splitNames(cp.partner),
      ];
      for (const member of podMembers) {
        if (teamMembers.has(member)) {
          const existing = teamMembers.get(member)!;
          if (!existing.some(e => e.id === c.id)) existing.push(c);
        }
      }
    }

    return Array.from(teamMembers.entries()).map(([name, clients]) => {
      const scored = clients.filter(c => c.latestScore != null);
      const avgScore = scored.length ? scored.reduce((s, c) => s + (c.latestScore || 0), 0) / scored.length : null;
      const status = getStatus(avgScore, settings);
      const totalMRR = clients.reduce((s, c) => s + c.monthlyFee, 0);
      const atRiskCount = scored.filter(c => c.status === "AT RISK").length;
      const watchCount = scored.filter(c => c.status === "WATCH").length;
      const healthyCount = scored.filter(c => c.status === "HEALTHY").length;
      return { name, clients, scored: scored.length, avgScore, status, totalMRR, atRiskCount, watchCount, healthyCount };
    }).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  }, [stats, settings]);

  const [expanded, setExpanded] = useState<string | null>(null);

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Team Members" value={teamData.length} darkMode={darkMode} />
      <StatCard label="Avg Health Score" value={(() => { const s = teamData.filter(t => t.avgScore != null); return s.length ? (s.reduce((a, t) => a + (t.avgScore || 0), 0) / s.length).toFixed(1) : "N/A"; })()} darkMode={darkMode} />
      <StatCard label="Total Clients" value={stats.length} darkMode={darkMode} />
      <StatCard label="Total MRR" value={fmtM(stats.reduce((s, c) => s + c.monthlyFee, 0))} color="#1B2A4A" darkMode={darkMode} />
    </div>

    <div className={`rounded-xl border overflow-hidden ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <table className="w-full text-sm">
        <thead><tr className={darkMode ? "bg-slate-700" : "bg-gray-50"}>
          <th className={`text-left px-4 py-2.5 text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Team Member</th>
          <th className={`text-center px-2 py-2.5 text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Clients</th>
          <th className={`text-center px-2 py-2.5 text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Avg Score</th>
          <th className={`text-center px-2 py-2.5 text-xs font-semibold hidden sm:table-cell ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Healthy</th>
          <th className={`text-center px-2 py-2.5 text-xs font-semibold hidden sm:table-cell ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Watch</th>
          <th className={`text-center px-2 py-2.5 text-xs font-semibold hidden sm:table-cell ${darkMode ? "text-gray-300" : "text-gray-600"}`}>At Risk</th>
          <th className={`text-right px-4 py-2.5 text-xs font-semibold ${darkMode ? "text-gray-300" : "text-gray-600"}`}>MRR</th>
        </tr></thead>
        <tbody>
          {teamData.map(tm => (
            <Fragment key={tm.name}>
              <tr className={`border-t cursor-pointer ${darkMode ? "border-slate-700 hover:bg-slate-700" : "border-gray-100 hover:bg-gray-50"}`} onClick={() => setExpanded(expanded === tm.name ? null : tm.name)}>
                <td className={`px-4 py-3 font-medium ${darkMode ? "text-gray-200" : "text-gray-900"}`}>{tm.name}</td>
                <td className={`text-center px-2 py-3 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{tm.clients.length}</td>
                <td className="text-center px-2 py-3"><ScoreCircle score={tm.avgScore} size={32} settings={settings} /></td>
                <td className={`text-center px-2 py-3 hidden sm:table-cell text-green-600 font-semibold`}>{tm.healthyCount}</td>
                <td className={`text-center px-2 py-3 hidden sm:table-cell text-amber-600 font-semibold`}>{tm.watchCount}</td>
                <td className={`text-center px-2 py-3 hidden sm:table-cell text-red-600 font-semibold`}>{tm.atRiskCount}</td>
                <td className={`text-right px-4 py-3 font-medium ${darkMode ? "text-gray-200" : "text-gray-900"}`}>{fmtM(tm.totalMRR)}</td>
              </tr>
              {expanded === tm.name && <tr><td colSpan={7}>
                <div className={`px-4 py-2 space-y-1 ${darkMode ? "bg-slate-900/50" : "bg-gray-50"}`}>
                  {tm.clients.map(c => (
                    <div key={c.id} className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer ${darkMode ? "hover:bg-slate-700" : "hover:bg-white"}`} onClick={() => onSelect(c.id)}>
                      <span className={`text-sm font-medium flex-1 truncate ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</span>
                      <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier}</span>
                      <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{fmtM(c.monthlyFee)}/mo</span>
                      <Badge status={c.status} sm />
                    </div>
                  ))}
                </div>
              </td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}

// ===== COMPLIANCE =====
function ComplianceTab({ stats, onSelect, darkMode }: { stats: ClientStat[]; onSelect: (id: string) => void; darkMode?: boolean }) {
  const nowMs = Date.now();
  const cc: Record<string, { bg: string; tx: string }> = { OVERDUE: { bg: "#fecaca", tx: "#991b1b" }, NEVER: { bg: "#e5e7eb", tx: "#374151" }, "DUE SOON": { bg: "#fef9c3", tx: "#854d0e" }, "ON TRACK": { bg: "#dcfce7", tx: "#166534" } };
  const items = useMemo(() => stats.map(c => {
    const isQuarterly = SCORING_FREQUENCY[c.tier] === "quarterly";
    const now = new Date(nowMs);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const curQuarter = quarterFromMonth(curMonth);

    // Deadline = last day of current period (month or quarter)
    const periodEnd = isQuarterly
      ? new Date(curYear, quarterEndMonth(curQuarter) + 1, 0, 23, 59, 59)
      : new Date(curYear, curMonth + 1, 0, 23, 59, 59);
    const periodLabel = isQuarterly
      ? `Q${curQuarter + 1} ${curYear}`
      : `${MO[curMonth]} ${curYear}`;

    // Has this client been scored for the current period?
    const scoredThisPeriod = !!c.latest && c.latest.year === curYear && (
      isQuarterly
        ? quarterFromMonth(c.latest.month) === curQuarter
        : c.latest.month === curMonth
    );

    const daysUntilDeadline = Math.ceil((periodEnd.getTime() - nowMs) / 86400000);
    const lastTs = c.lastScoredTs ? new Date(c.lastScoredTs).getTime() : null;
    const daysSince = lastTs ? Math.floor((nowMs - lastTs) / 86400000) : 999;

    let compStatus: string;
    if (!c.latest) {
      compStatus = "NEVER";
    } else if (scoredThisPeriod) {
      compStatus = "ON TRACK";
    } else if (daysUntilDeadline < 0) {
      compStatus = "OVERDUE";
    } else if (daysUntilDeadline <= 7) {
      compStatus = "DUE SOON";
    } else {
      compStatus = "ON TRACK";
    }

    return { ...c, daysSince, compStatus, daysUntilDeadline, periodLabel, isQuarterly };
  }).sort((a, b) => {
    // Sort: overdue/never first, then due soon, then on track
    const rank = (s: string) => s === "OVERDUE" || s === "NEVER" ? 0 : s === "DUE SOON" ? 1 : 2;
    const r = rank(a.compStatus) - rank(b.compStatus);
    return r !== 0 ? r : a.daysUntilDeadline - b.daysUntilDeadline;
  }), [stats, nowMs]);

  const groups = [
    { key: "overdue", items: items.filter(i => i.compStatus === "OVERDUE" || i.compStatus === "NEVER"), color: "red", label: "OVERDUE" },
    { key: "due", items: items.filter(i => i.compStatus === "DUE SOON"), color: "amber", label: "DUE SOON" },
    { key: "ok", items: items.filter(i => i.compStatus === "ON TRACK"), color: "green", label: "ON TRACK" },
  ];

  return <div className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      <StatCard label="Overdue" value={groups[0].items.length} color="#991b1b" darkMode={darkMode} />
      <StatCard label="Due Soon" value={groups[1].items.length} color="#854d0e" darkMode={darkMode} />
      <StatCard label="On Track" value={groups[2].items.length} color="#166534" darkMode={darkMode} />
    </div>
    {groups.filter(g => g.items.length > 0).map(g => (
      <div key={g.key} className={`rounded-xl border border-${g.color}-200 p-4 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
        <h3 className={`text-sm font-semibold text-${g.color}-700 mb-3`}>{g.label} ({g.items.length})</h3>
        {g.items.map(c => {
          const co = cc[c.compStatus];
          const deadlineText = c.compStatus === "OVERDUE"
            ? `${Math.abs(c.daysUntilDeadline)}d overdue`
            : c.compStatus === "NEVER"
              ? "Never scored"
              : c.daysUntilDeadline <= 0
                ? "Due today"
                : `${c.daysUntilDeadline}d left`;
          return <div key={c.id} className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer ${darkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"}`} onClick={() => onSelect(c.id)}>
            <div className={`w-40 truncate text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</div>
            <span className={`text-xs px-2 py-0.5 rounded w-24 text-center truncate ${darkMode ? "bg-slate-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{c.isQuarterly ? "Quarterly" : "Monthly"}</span>
            <span className={`text-xs w-20 text-center ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{c.periodLabel}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold w-20 text-center" style={{ background: co.bg, color: co.tx }}>{c.compStatus}</span>
            <span className={`text-xs w-24 text-right ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{deadlineText}</span>
          </div>;
        })}
      </div>
    ))}
  </div>;
}

// ===== ALERTS (with anniversaries) =====
function AlertsTab({ stats, onSelect, darkMode }: { stats: ClientStat[]; onSelect: (id: string) => void; darkMode?: boolean }) {
  const atRisk = stats.filter(c => c.status === "AT RISK");
  const dropped = stats.filter(c => c.dropped);
  const watchList = stats.filter(c => c.status === "WATCH");
  const upcoming = stats.filter(c => c.anniversaryDays != null && c.anniversaryDays <= 30).sort((a, b) => (a.anniversaryDays || 0) - (b.anniversaryDays || 0));

  return <div className="space-y-4">
    {upcoming.length > 0 && <div className={`rounded-xl border-2 border-purple-300 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-purple-700 mb-2">{"🎂"} UPCOMING ANNIVERSARIES ({upcoming.length})</h3>
      <p className="text-xs text-purple-500 mb-3">Client onboarding anniversaries within 30 days -- trigger a wow moment!</p>
      {upcoming.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer border-b border-purple-100 last:border-0 ${darkMode ? "hover:bg-purple-900/20" : "hover:bg-purple-50"}`} onClick={() => onSelect(c.id)}>
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-lg">{"🎂"}</div>
          <div className="flex-1 min-w-0"><div className={`text-sm font-semibold truncate ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier} {"\u00B7"} {c.leadAdvisor} {"\u00B7"} {fmtM(c.monthlyFee)}/mo</div></div>
          <div className="text-right shrink-0"><div className="text-sm font-bold text-purple-700">{c.anniversaryDays === 0 ? "TODAY!" : `In ${c.anniversaryDays} days`}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{c.nextAnniversary}</div></div>
        </div>
      ))}
    </div>}

    {atRisk.length > 0 && <div className={`rounded-xl border-2 border-red-300 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-red-700 mb-3">{"🚨"} AT RISK ({atRisk.length})</h3>
      {atRisk.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer border-b border-red-100 last:border-0 ${darkMode ? "hover:bg-red-900/20" : "hover:bg-red-50"}`} onClick={() => onSelect(c.id)}>
          <ScoreCircle score={c.latestScore} size={36} />
          <div className="flex-1 min-w-0"><div className={`text-sm font-semibold truncate ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier} {"\u00B7"} {fmtM(c.monthlyFee)}/mo</div></div>
          <div className="text-sm font-bold text-red-700">{fmtM(c.monthlyFee * 12)}/yr</div>
        </div>
      ))}
    </div>}

    {dropped.length > 0 && <div className={`rounded-xl border-2 border-amber-300 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-amber-700 mb-3">{"\u26A0\uFE0F"} STATUS DROPPED ({dropped.length})</h3>
      {dropped.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 cursor-pointer rounded-lg ${darkMode ? "hover:bg-amber-900/20" : "hover:bg-amber-50"}`} onClick={() => onSelect(c.id)}>
          <ScoreCircle score={c.latestScore} size={36} />
          <div className="flex-1"><div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div></div>
          <Badge status={c.prevStatus} sm /><span className={darkMode ? "text-gray-500" : "text-gray-400"}>{"\u2192"}</span><Badge status={c.status} sm />
        </div>
      ))}
    </div>}

    {watchList.length > 0 && <div className={`rounded-xl border border-amber-200 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-amber-700 mb-3">{"👀"} WATCH LIST ({watchList.length})</h3>
      {watchList.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 cursor-pointer rounded-lg ${darkMode ? "hover:bg-amber-900/20" : "hover:bg-amber-50"}`} onClick={() => onSelect(c.id)}>
          <ScoreCircle score={c.latestScore} size={36} />
          <div className="flex-1"><div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{fmtM(c.monthlyFee)}/mo</div></div>
          <TrendArrow cur={c.latestScore} prev={c.prevScore} />
        </div>
      ))}
    </div>}

    {atRisk.length + dropped.length + watchList.length + upcoming.length === 0 && <div className={`rounded-xl border border-green-200 p-8 text-center ${darkMode ? "bg-slate-800" : "bg-white"}`}><p className="text-green-700 font-semibold">Portfolio healthy -- no alerts!</p></div>}
  </div>;
}

// ===== REVENUE =====
function RevenueTab({ stats, darkMode, settings }: { stats: ClientStat[]; darkMode?: boolean; settings?: Settings }) {
  const activeClients = stats.filter(c => c.engagementStatus !== "Paused" && c.engagementStatus !== "Offboarded");
  const pausedClients = stats.filter(c => c.engagementStatus === "Paused");
  const offboardedClients = stats.filter(c => c.engagementStatus === "Offboarded");

  const totalRev = activeClients.reduce((s, c) => s + c.monthlyFee, 0);
  const pausedRev = pausedClients.reduce((s, c) => s + c.monthlyFee, 0);
  const lostRev = offboardedClients.reduce((s, c) => s + c.monthlyFee, 0);

  const byStatus = ["HEALTHY", "WATCH", "AT RISK", null].map(st => {
    const cs = activeClients.filter(c => c.status === st); const rev = cs.reduce((s, c) => s + c.monthlyFee, 0);
    return { status: st || "UNSCORED", count: cs.length, rev, pct: totalRev ? rev / totalRev * 100 : 0 };
  });
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Monthly Rev" value={fmtM(totalRev)} color="#1B2A4A" sub={fmtM(totalRev * 12) + "/yr"} darkMode={darkMode} />
      <StatCard label="Healthy Rev" value={fmtM(byStatus[0].rev)} color="#166534" sub={`${Math.round(byStatus[0].pct)}%`} darkMode={darkMode} />
      <StatCard label="Watch Rev" value={fmtM(byStatus[1].rev)} color="#854d0e" sub={`${Math.round(byStatus[1].pct)}%`} darkMode={darkMode} />
      <StatCard label="At-Risk Rev" value={fmtM(byStatus[2].rev)} color="#991b1b" sub={`${Math.round(byStatus[2].pct)}%`} darkMode={darkMode} />
    </div>

    {/* Churn tracker */}
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Paused Rev" value={fmtM(pausedRev)} color="#d97706" sub={`${pausedClients.length} client${pausedClients.length === 1 ? "" : "s"}`} darkMode={darkMode} />
      <StatCard label="Lost Rev" value={fmtM(lostRev)} color="#991b1b" sub={`${offboardedClients.length} offboarded`} darkMode={darkMode} />
    </div>

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>REVENUE BY STATUS (Active clients)</h3>
      <div className="h-8 flex rounded-lg overflow-hidden mb-2">
        {byStatus.filter(s => s.pct > 0).map(s => {
          const c = sColor(s.status === "UNSCORED" ? null : s.status);
          return <div key={s.status} style={{ width: `${s.pct}%`, background: c.bd }} className="flex items-center justify-center">{s.pct > 10 && <span className="text-xs font-bold" style={{ color: c.tx }}>{Math.round(s.pct)}%</span>}</div>;
        })}
      </div>
    </div>

    {(pausedClients.length > 0 || offboardedClients.length > 0) && (
      <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
        <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>CHURN TRACKER</h3>
        {pausedClients.length > 0 && <div className="mb-3">
          <div className="text-xs font-semibold text-amber-600 mb-1.5">Paused ({pausedClients.length})</div>
          {pausedClients.map(c => (
            <div key={c.id} className="flex items-center gap-2 py-1">
              <span className={`flex-1 truncate text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</span>
              <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier}</span>
              <span className={`w-14 text-right text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{fmtM(c.monthlyFee)}</span>
            </div>
          ))}
        </div>}
        {offboardedClients.length > 0 && <div>
          <div className="text-xs font-semibold text-red-600 mb-1.5">Offboarded ({offboardedClients.length})</div>
          {offboardedClients.map(c => (
            <div key={c.id} className="flex items-center gap-2 py-1">
              <span className={`flex-1 truncate text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</span>
              <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier}</span>
              <span className={`w-14 text-right text-sm font-semibold line-through ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{fmtM(c.monthlyFee)}</span>
            </div>
          ))}
        </div>}
      </div>
    )}

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>BY CLIENT</h3>
      {[...activeClients].sort((a, b) => b.monthlyFee - a.monthlyFee).map(c => (
        <div key={c.id} className="flex items-center gap-2 py-1">
          <span className={`w-36 truncate text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</span>
          <div className={`flex-1 h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-gray-100"}`}><div className="h-full rounded-full" style={{ width: `${totalRev ? c.monthlyFee / totalRev * 100 : 0}%`, background: sColor(c.status).bd }} /></div>
          <span className={`w-14 text-right text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{fmtM(c.monthlyFee)}</span>
          <Badge status={c.status} sm />
        </div>
      ))}
    </div>
  </div>;
}

// ===== REFERRALS =====
function ReferralsTab({ stats, referrals, onAddRef, referralSources, darkMode }: { stats: ClientStat[]; referrals: Referral[]; onAddRef: () => void; referralSources?: string[]; darkMode?: boolean }) {
  const sources = referralSources || REFERRAL_SOURCES;
  const bySrc = sources.map(src => {
    const cs = stats.filter(c => c.referralSource === src);
    return { source: src, count: cs.length, rev: cs.reduce((s, c) => s + c.monthlyFee, 0) };
  }).filter(s => s.count > 0).sort((a, b) => b.rev - a.rev);

  const referrerIds = Array.from(new Set(referrals.map(r => r.referrerId)));
  const topReferrers = referrerIds.map(id => {
    const client = stats.find(c => c.id === id);
    const refs = referrals.filter(r => r.referrerId === id);
    return { client, refs, totalRevGen: refs.reduce((s, r) => s + r.revenueGenerated, 0), count: refs.length };
  }).filter(r => r.client).sort((a, b) => b.totalRevGen - a.totalRevGen);

  const totalRefRev = referrals.filter(r => r.status === "Active").reduce((s, r) => s + r.revenueGenerated, 0);

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total Referrals" value={referrals.length} color="#1B2A4A" darkMode={darkMode} />
      <StatCard label="Active" value={referrals.filter(r => r.status === "Active").length} color="#166534" darkMode={darkMode} />
      <StatCard label="Prospects" value={referrals.filter(r => r.status === "Prospect").length} color="#854d0e" darkMode={darkMode} />
      <StatCard label="Referral Rev" value={fmtM(totalRefRev)} color="#166534" sub="/mo generated" darkMode={darkMode} />
    </div>

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex justify-between items-center mb-4"><h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>TOP REFERRERS</h3>
        <button onClick={onAddRef} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">+ Log Referral</button>
      </div>
      {topReferrers.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No referrals yet.</p> :
        topReferrers.map(r => (
          <div key={r.client!.id} className={`flex items-center gap-3 py-3 border-b last:border-0 ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">{r.count}</div>
            <div className="flex-1 min-w-0"><div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{r.client!.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{r.count} referral{r.count > 1 ? "s" : ""}</div></div>
            <div className="text-right"><div className="text-sm font-bold text-green-700">{fmtM(r.totalRevGen)}/mo</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{fmtM(r.totalRevGen * 12)}/yr</div></div>
          </div>
        ))}
    </div>

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>ACQUISITION CHANNELS</h3>
      {bySrc.map(s => (
        <div key={s.source} className="mb-3">
          <div className="flex justify-between text-sm mb-1"><span className={`font-medium ${darkMode ? "text-gray-200" : ""}`}>{s.source}</span><span className={darkMode ? "text-gray-400" : "text-gray-500"}>{s.count} {"\u00B7"} {fmtM(s.rev)}/mo</span></div>
          <div className={`h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-gray-100"}`}><div className="h-full bg-blue-400 rounded-full" style={{ width: `${stats.reduce((sum, c) => sum + c.monthlyFee, 0) ? s.rev / stats.reduce((sum, c) => sum + c.monthlyFee, 0) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </div>

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>REFERRAL LOG</h3>
      {referrals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(r => {
        const referrer = stats.find(c => c.id === r.referrerId);
        const referred = stats.find(c => c.id === r.referredClientId);
        const stCls = r.status === "Active" ? "text-green-700 bg-green-100" : r.status === "Prospect" ? "text-amber-700 bg-amber-100" : "text-gray-600 bg-gray-100";
        return <div key={r.id} className={`flex items-center gap-3 py-2 border-b last:border-0 ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
          <div className="flex-1 min-w-0"><div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{referrer?.name || "?"}</span> {"\u2192"} <span className="font-semibold">{referred?.name || "Prospect"}</span></div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{r.date} {"\u00B7"} {r.notes}</div></div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stCls}`}>{r.status}</span>
          {r.revenueGenerated > 0 && <span className="text-sm font-bold text-green-700">{fmtM(r.revenueGenerated)}</span>}
        </div>;
      })}
    </div>
  </div>;
}

// ===== ACTIVITY =====
function ActivityTab({ clients, scores, wows, npsFeedback, currentUser, darkMode, settings }: { clients: Client[]; scores: Score[]; wows: Wow[]; npsFeedback: NPSFeedback[]; currentUser?: UserProfile; darkMode?: boolean; settings?: Settings }) {
  const [filterMine, setFilterMine] = useState(false);

  const events = useMemo(() => {
    const items: Array<{ type: string; ts: string; client: string; actor?: string; score?: number | null; status?: string | null; period?: string; notes?: string; description?: string; wowType?: string; npsScore?: number; npsCategory?: string; comment?: string; source?: string }> = [];

    (scores || []).forEach(s => {
      const c = (clients || []).find(x => x.id === s.clientId);
      items.push({
        type: "score",
        ts: s.ts || `${s.year}-01-15T12:00:00Z`,
        client: c?.name || "?",
        actor: s.assessor,
        score: calcScore(s.scores),
        status: getStatus(calcScore(s.scores), settings),
        period: `${MO[s.month]} ${s.year}`,
        notes: s.notes,
      });
    });

    (wows || []).forEach(w => {
      const c = (clients || []).find(x => x.id === w.clientId);
      items.push({
        type: "wow",
        ts: w.date + "T12:00:00Z",
        client: c?.name || "?",
        actor: w.owner,
        description: w.description,
        wowType: w.type,
      });
    });

    (npsFeedback || []).forEach(f => {
      const c = (clients || []).find(x => x.id === f.clientId);
      items.push({
        type: "nps",
        ts: f.ts,
        client: c?.name || "?",
        actor: f.assessor,
        npsScore: f.npsScore,
        npsCategory: npsCategory(f.npsScore),
        comment: f.comment,
        source: f.source,
      });
    });

    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [clients, scores, wows, npsFeedback, settings]);

  const actorMatches = (actor?: string) => {
    if (!currentUser) return true;
    if (!actor) return false;
    const name = (currentUser.advisorName || currentUser.name || "").toLowerCase();
    const simpleName = name.replace(/\s*\(.*\)\s*/g, "").trim();
    return actor.toLowerCase() === simpleName || actor.toLowerCase() === name;
  };

  const filteredEvents = filterMine ? events.filter(e => actorMatches(e.actor)) : events;

  const iconForEvent = (e: typeof events[number]) => {
    if (e.type === "score") return <ScoreCircle score={e.score ?? null} size={32} />;
    if (e.type === "wow") return <div className={`w-8 h-8 rounded-full ${darkMode ? "bg-amber-700" : "bg-amber-200"} flex items-center justify-center text-sm`}>{"\u2B50"}</div>;
    // NPS
    const cat = e.npsCategory;
    const bg = cat === "Promoter" ? (darkMode ? "bg-green-700" : "bg-green-200") : cat === "Passive" ? (darkMode ? "bg-amber-700" : "bg-amber-200") : (darkMode ? "bg-red-800" : "bg-red-200");
    const txt = cat === "Promoter" ? (darkMode ? "text-green-100" : "text-green-800") : cat === "Passive" ? (darkMode ? "text-amber-100" : "text-amber-800") : (darkMode ? "text-red-100" : "text-red-800");
    return <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center text-xs font-bold ${txt}`}>{e.npsScore}</div>;
  };

  const rowBg = (e: typeof events[number]) => {
    if (e.type === "wow") return darkMode ? "border-amber-900 bg-amber-950" : "border-amber-100 bg-amber-50";
    if (e.type === "nps") {
      const cat = e.npsCategory;
      if (cat === "Promoter") return darkMode ? "border-green-900 bg-green-950" : "border-green-100 bg-green-50";
      if (cat === "Detractor") return darkMode ? "border-red-900 bg-red-950" : "border-red-100 bg-red-50";
      return darkMode ? "border-slate-600 bg-slate-700" : "border-gray-100";
    }
    if (e.status === "AT RISK") return darkMode ? "border-red-900 bg-red-950" : "border-red-100 bg-red-50";
    return darkMode ? "border-slate-600 bg-slate-700" : "border-gray-100";
  };

  return <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
    <div className="flex items-center justify-between mb-4">
      <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>ACTIVITY FEED</h3>
      {currentUser && <label className={`flex items-center gap-2 text-xs cursor-pointer ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
        <input type="checkbox" checked={filterMine} onChange={e => setFilterMine(e.target.checked)} className="accent-blue-600" />
        My activity only
      </label>}
    </div>
    <div className="space-y-3">
      {filteredEvents.map((e, i) => (
        <div key={i} className={`flex gap-3 p-3 rounded-lg border ${rowBg(e)}`}>
          <div className="shrink-0">{iconForEvent(e)}</div>
          <div className="flex-1 min-w-0">
            {e.type === "score" && <>
              <div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{e.actor}</span> scored <span className="font-semibold">{e.client}</span> {"\u2014"} {e.period}</div>
              <div className="flex items-center gap-2 mt-1"><span className={`text-sm font-bold ${darkMode ? "text-white" : ""}`} style={{ color: darkMode ? "#ffffff" : sColor(e.status ?? null).tx }}>{e.score?.toFixed(1)}</span><Badge status={e.status ?? null} sm /></div>
              {e.notes && <p className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{e.notes}</p>}
            </>}
            {e.type === "wow" && <>
              <div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{e.actor}</span> delivered a wow {"\u2192"} <span className="font-semibold">{e.client}</span>{e.wowType ? <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${darkMode ? "bg-amber-800 text-amber-100" : "bg-amber-100 text-amber-700"}`}>{e.wowType}</span> : null}</div>
              <p className={`text-xs mt-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{e.description}</p>
            </>}
            {e.type === "nps" && <>
              <div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}>
                <span className="font-semibold">{e.client}</span> logged NPS <span className="font-semibold">{e.npsScore}</span>{" "}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${e.npsCategory === "Promoter" ? "bg-green-100 text-green-700" : e.npsCategory === "Passive" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{e.npsCategory}</span>
              </div>
              <div className={`text-[11px] mt-1 ${darkMode ? "text-gray-500" : "text-gray-500"}`}>via {e.source}{e.actor ? ` \u00B7 logged by ${e.actor}` : ""}</div>
              {e.comment && <p className={`text-xs mt-1 italic ${darkMode ? "text-gray-300" : "text-gray-600"}`}>&ldquo;{e.comment}&rdquo;</p>}
            </>}
          </div>
          <div className={`text-[10px] shrink-0 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{timeAgo(e.ts)}</div>
        </div>
      ))}
      {filteredEvents.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{filterMine ? "No activity by you yet." : "No activity yet."}</p>}
    </div>
  </div>;
}

// ===== NPS / FEEDBACK TAB =====
function NPSTab({ stats, npsFeedback, onAddFeedback, onImportSurveys, darkMode }: {
  stats: ClientStat[]; npsFeedback: NPSFeedback[]; onAddFeedback: (fb: NPSFeedback) => void; onImportSurveys: () => Promise<number>; darkMode?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [fbClientId, setFbClientId] = useState("");
  const [fbScore, setFbScore] = useState(8);
  const [fbComment, setFbComment] = useState("");
  const [fbSource, setFbSource] = useState<string>(NPS_SOURCES[0]);
  const [fbAssessor, setFbAssessor] = useState("");

  const sorted = useMemo(() => [...npsFeedback].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()), [npsFeedback]);
  const avgNPS = npsFeedback.length ? npsFeedback.reduce((s, f) => s + f.npsScore, 0) / npsFeedback.length : 0;
  const promoters = npsFeedback.filter(f => npsCategory(f.npsScore) === "Promoter").length;
  const passives = npsFeedback.filter(f => npsCategory(f.npsScore) === "Passive").length;
  const detractors = npsFeedback.filter(f => npsCategory(f.npsScore) === "Detractor").length;
  const pctProm = npsFeedback.length ? Math.round(promoters / npsFeedback.length * 100) : 0;
  const pctPass = npsFeedback.length ? Math.round(passives / npsFeedback.length * 100) : 0;
  const pctDet = npsFeedback.length ? Math.round(detractors / npsFeedback.length * 100) : 0;

  const handleSubmit = () => {
    if (!fbClientId || !fbAssessor) return;
    onAddFeedback({
      id: "nps" + Date.now(),
      clientId: fbClientId,
      npsScore: fbScore,
      comment: fbComment,
      source: fbSource,
      assessor: fbAssessor,
      ts: new Date().toISOString(),
    });
    setShowForm(false);
    setFbClientId(""); setFbScore(8); setFbComment(""); setFbSource(NPS_SOURCES[0]); setFbAssessor("");
  };

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatCard label="Avg NPS" value={avgNPS.toFixed(1)} color={avgNPS >= 9 ? "#166534" : avgNPS >= 7 ? "#854d0e" : "#991b1b"} darkMode={darkMode} />
      <StatCard label="Responses" value={npsFeedback.length} darkMode={darkMode} />
      <StatCard label="Promoters" value={`${pctProm}%`} color="#166534" sub={`${promoters} total`} darkMode={darkMode} />
      <StatCard label="Passives" value={`${pctPass}%`} color="#854d0e" sub={`${passives} total`} darkMode={darkMode} />
      <StatCard label="Detractors" value={`${pctDet}%`} color="#991b1b" sub={`${detractors} total`} darkMode={darkMode} />
    </div>

    {/* NPS Bar */}
    {npsFeedback.length > 0 && <div className={`rounded-xl border p-4 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>NPS DISTRIBUTION</h3>
      <div className="h-6 flex rounded-lg overflow-hidden">
        {pctProm > 0 && <div style={{ width: `${pctProm}%` }} className="bg-green-400 flex items-center justify-center"><span className="text-xs font-bold text-green-900">{pctProm}%</span></div>}
        {pctPass > 0 && <div style={{ width: `${pctPass}%` }} className="bg-amber-300 flex items-center justify-center"><span className="text-xs font-bold text-amber-900">{pctPass}%</span></div>}
        {pctDet > 0 && <div style={{ width: `${pctDet}%` }} className="bg-red-400 flex items-center justify-center"><span className="text-xs font-bold text-red-900">{pctDet}%</span></div>}
      </div>
      <div className="flex gap-4 mt-2 text-xs">
        <span className="text-green-700">Promoter (9-10)</span>
        <span className="text-amber-700">Passive (7-8)</span>
        <span className="text-red-700">Detractor (0-6)</span>
      </div>
    </div>}

    {/* Send NPS Survey */}
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>NPS SURVEYS</h3>
        <button onClick={async () => { setImporting(true); setImportMsg(""); const count = await onImportSurveys(); setImportMsg(count > 0 ? `Imported ${count} response${count > 1 ? "s" : ""}!` : "No new responses"); setImporting(false); setTimeout(() => setImportMsg(""), 3000); }} disabled={importing} className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 ${importing ? "opacity-50" : ""} ${darkMode ? "text-gray-400 hover:text-blue-400 hover:bg-slate-700" : "text-gray-500 hover:text-blue-600 hover:bg-gray-100"}`}>
          <span className={importing ? "animate-spin inline-block" : ""}>{"\u21BB"}</span> Check for Responses
        </button>
      </div>
      {importMsg && <div className={`text-xs mb-3 px-3 py-1.5 rounded-lg ${importMsg.includes("Imported") ? "bg-green-100 text-green-700" : (darkMode ? "bg-slate-700 text-gray-400" : "bg-gray-100 text-gray-500")}`}>{importMsg}</div>}
      <p className={`text-xs mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Generate a unique survey link for a client. They can fill it out and it feeds directly into their profile.</p>
      <div className="flex items-end gap-2">
        <div className="flex-1"><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Client</label>
          <select id="nps-survey-client" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} defaultValue="">
            <option value="">Select client...</option>
            {stats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={() => {
          const sel = document.getElementById("nps-survey-client") as HTMLSelectElement;
          const cId = sel?.value; if (!cId) return;
          const cl = stats.find(c => c.id === cId); if (!cl) return;
          const link = generateNPSSurveyLink(cId, cl.name);
          navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }} className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-1.5 ${copied ? "bg-green-600 text-white hover:bg-green-700" : "bg-purple-600 text-white hover:bg-purple-700"}`}>
          {copied ? <>{"\u2713"} Copied</> : "Copy Survey Link"}
        </button>
      </div>
    </div>

    {/* Add feedback form */}
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>NPS FEEDBACK</h3>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
          {showForm ? "Cancel" : "+ Log NPS"}
        </button>
      </div>
      {showForm && <div className={`mb-4 p-4 rounded-lg border ${darkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Client</label>
              <select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-600 border-slate-500 text-gray-200" : "border-gray-200 bg-white"}`} value={fbClientId} onChange={e => setFbClientId(e.target.value)}>
                <option value="">Select...</option>{stats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>NPS Score (0-10)</label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="10" value={fbScore} onChange={e => setFbScore(Number(e.target.value))} className="flex-1 h-2 accent-blue-600" />
                <span className="w-8 text-center text-sm font-bold" style={{ color: npsColor(fbScore) }}>{fbScore}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Source</label>
              <select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-600 border-slate-500 text-gray-200" : "border-gray-200 bg-white"}`} value={fbSource} onChange={e => setFbSource(e.target.value)}>
                {NPS_SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Assessor</label>
              <select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-600 border-slate-500 text-gray-200" : "border-gray-200 bg-white"}`} value={fbAssessor} onChange={e => setFbAssessor(e.target.value)}>
                <option value="">Select...</option>{ADVISORS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Comment</label>
            <textarea className={`w-full border rounded-lg px-3 py-2 text-sm h-16 ${darkMode ? "bg-slate-600 border-slate-500 text-gray-200" : "border-gray-200 bg-white"}`} value={fbComment} onChange={e => setFbComment(e.target.value)} />
          </div>
          <button onClick={handleSubmit} disabled={!fbClientId || !fbAssessor} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save Feedback</button>
        </div>
      </div>}

      {/* Feed */}
      {sorted.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No NPS feedback yet.</p> :
        sorted.map(fb => {
          const client = stats.find(c => c.id === fb.clientId);
          const cat = npsCategory(fb.npsScore);
          const catBg = cat === "Promoter" ? "bg-green-100 text-green-700" : cat === "Passive" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
          return <div key={fb.id} className={`flex items-start gap-3 py-3 border-b last:border-0 ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: cat === "Promoter" ? "#dcfce7" : cat === "Passive" ? "#fef9c3" : "#fecaca", color: npsColor(fb.npsScore) }}>{fb.npsScore}</div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{client?.name || "?"}</span><span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-semibold ${catBg}`}>{cat}</span></div>
              {fb.comment && <p className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{fb.comment}</p>}
              <div className={`text-[10px] mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{fb.source} {"\u00B7"} {fb.assessor} {"\u00B7"} {timeAgo(fb.ts)}</div>
            </div>
          </div>;
        })}
    </div>
  </div>;
}

// ===== SETTINGS =====
function SettingsTab({ settings, onSave, onSync, onImport, onCSVImport, darkMode, currentUser }: {
  settings: Settings; onSave: (s: Settings) => void; onSync: () => void;
  onImport: (clients: Client[]) => Promise<number>;
  onCSVImport: (clients: Client[]) => void;
  darkMode?: boolean; currentUser?: UserProfile;
}) {
  const [sources, setSources] = useState<string[]>(settings.referralSources || REFERRAL_SOURCES);
  const [newSource, setNewSource] = useState("");
  const [wbEnabled, setWbEnabled] = useState(settings.wealthboxEnabled || false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [importStatus, setImportStatus] = useState<string>("");
  const [testStatus, setTestStatus] = useState<string>("");
  const [importDialog, setImportDialog] = useState<{ open: boolean; clients: Client[] }>({ open: false, clients: [] });

  // CSV import state
  const [csvPreview, setCsvPreview] = useState<Client[] | null>(null);
  const [csvError, setCsvError] = useState("");

  // Scoring config state
  const { atRisk: curAtRisk, watch: curWatch } = getThresholds(settings);
  const lockedWeights = getEffectiveWeights(settings);
  const [scAtRisk, setScAtRisk] = useState(curAtRisk);
  const [scWatch, setScWatch] = useState(curWatch);

  const addSource = () => {
    if (newSource.trim() && !sources.includes(newSource.trim())) {
      const updated = [...sources, newSource.trim()];
      setSources(updated);
      setNewSource("");
    }
  };

  const removeSource = (source: string) => {
    setSources(sources.filter(s => s !== source));
  };

  const handleSave = () => {
    const existingWeights = settings.scoringConfig?.dimensionWeights || {};
    const config: ScoringConfig = {
      atRiskThreshold: scAtRisk,
      watchThreshold: scWatch,
      dimensionWeights: existingWeights,
    };
    onSave({ ...settings, referralSources: sources, wealthboxEnabled: wbEnabled, scoringConfig: config });
  };

  const handleTestConnection = async () => {
    setTestStatus("Testing...");
    try {
      const result = await testWealthboxConnection();
      if (result.success) {
        setTestStatus(`Connected! Found ${result.count} contacts`);
      } else {
        setTestStatus(`Failed: ${result.message}`);
      }
    } catch (error) {
      setTestStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus("Syncing...");
    try {
      await onSync();
      const now = new Date().toLocaleString();
      setSyncStatus(`Synced at ${now}`);
      onSave({ ...settings, lastWealthboxSync: now });
    } catch (error) {
      setSyncStatus(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleImportClick = async () => {
    setImporting(true);
    setImportStatus("Fetching new clients...");
    try {
      const { newClients } = await importNewClientsFromWealthbox([]);
      if (newClients.length === 0) {
        setImportStatus(`No new clients to import`);
        setImporting(false);
      } else {
        setImportDialog({ open: true, clients: newClients });
        setImportStatus("");
        setImporting(false);
      }
    } catch (error) {
      setImportStatus(`Failed to fetch clients: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setImporting(false);
    }
  };

  const handleImportConfirm = async (selectedIds: string[]) => {
    setImportDialog({ open: false, clients: [] });
    setImporting(true);
    setImportStatus("Enriching with tasks...");
    try {
      const selectedClients = importDialog.clients.filter(c => selectedIds.includes(c.id));
      const enrichedClients = await enrichClientsWithTasks(selectedClients);
      setImportStatus("Importing...");
      const count = await onImport(enrichedClients);
      setImportStatus(`Imported ${count} client${count === 1 ? '' : 's'} with task history!`);
    } catch (error) {
      setImportStatus(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleImportCancel = () => {
    setImportDialog({ open: false, clients: [] });
    setImportStatus("");
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseCSVClients(text);
        if (parsed.length === 0) {
          setCsvError("No valid clients found in CSV. Ensure the CSV has a header row with columns like name, tier, lead_advisor, etc.");
          setCsvPreview(null);
        } else {
          setCsvPreview(parsed);
        }
      } catch (err) {
        setCsvError(`Error parsing CSV: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setCsvPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleCSVConfirm = () => {
    if (csvPreview && csvPreview.length > 0) {
      onCSVImport(csvPreview);
      setCsvPreview(null);
    }
  };


  return <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
    <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>SETTINGS</h3>

    <div className="space-y-6 max-w-2xl">
      {/* Referral Sources */}
      <div>
        <h4 className={`text-base font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Referral Sources</h4>
        <p className={`text-xs mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Customize the available referral sources when adding clients and logging referrals.</p>

        <div className="space-y-2 mb-3">
          {sources.map((source, i) => (
            <div key={i} className={`flex items-center justify-between p-2 rounded-lg ${darkMode ? "bg-slate-700" : "bg-gray-50"}`}>
              <span className={`text-sm ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{source}</span>
              <button onClick={() => removeSource(source)} className={`text-xs px-2 py-1 rounded ${darkMode ? "text-red-400 hover:bg-red-900" : "text-red-600 hover:bg-red-50"}`}>Remove</button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className={`flex-1 border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-400" : "border-gray-200 bg-white"}`}
            placeholder="Add new source..."
            value={newSource}
            onChange={e => setNewSource(e.target.value)}
            onKeyPress={e => e.key === "Enter" && addSource()}
          />
          <button onClick={addSource} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add</button>
        </div>
      </div>

      {/* CSV Import */}
      <div>
        <h4 className={`text-base font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>CSV Import</h4>
        <p className={`text-xs mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Import clients from a CSV file. Expected columns: name, tier, lead_advisor, onboard_date, monthly_fee, referral_source, referred_by, pod, wpa.</p>
        <input
          type="file"
          accept=".csv"
          onChange={handleCSVFile}
          className={`block w-full text-sm ${darkMode ? "text-gray-300" : "text-gray-700"} file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
        />
        {csvError && <div className="text-xs p-2 rounded mt-2 bg-red-100 text-red-800">{csvError}</div>}
        {csvPreview && csvPreview.length > 0 && <div className="mt-3">
          <div className={`text-sm font-medium mb-2 ${darkMode ? "text-gray-200" : "text-gray-700"}`}>Preview: {csvPreview.length} client{csvPreview.length === 1 ? "" : "s"} found</div>
          <div className={`max-h-48 overflow-y-auto rounded-lg border ${darkMode ? "border-slate-600" : "border-gray-200"}`}>
            {csvPreview.map((c, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 text-sm border-b last:border-0 ${darkMode ? "border-slate-600 text-gray-300" : "border-gray-100 text-gray-700"}`}>
                <span className="font-medium flex-1 truncate">{c.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? "bg-slate-600 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{c.tier}</span>
                <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.leadAdvisor}</span>
                <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{fmtM(c.monthlyFee)}/mo</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={handleCSVConfirm} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Import {csvPreview.length} Clients</button>
            <button onClick={() => setCsvPreview(null)} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300" : "border-gray-200 text-gray-600"}`}>Cancel</button>
          </div>
        </div>}
      </div>

      {/* Wealthbox Integration */}
      <div>
        <h4 className={`text-base font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Wealthbox Integration</h4>
        <p className={`text-xs mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Sync clients from Wealthbox and push health scores back to custom fields.</p>

        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wbEnabled}
              onChange={e => setWbEnabled(e.target.checked)}
              className="rounded"
            />
            <span className={`text-sm ${darkMode ? "text-gray-200" : "text-gray-700"}`}>Enable Wealthbox sync</span>
          </label>

          {wbEnabled && (
            <div className={`space-y-3 p-3 rounded-lg ${darkMode ? "bg-slate-700" : "bg-blue-50"}`}>
              <div className="flex gap-2">
                <button
                  onClick={handleTestConnection}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${darkMode ? "bg-slate-600 text-gray-200 hover:bg-slate-500" : "bg-white text-gray-700 hover:bg-gray-50"} border ${darkMode ? "border-slate-500" : "border-gray-300"}`}
                >
                  Test Connection
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${syncing ? "opacity-50 cursor-not-allowed" : ""} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
              </div>

              <div className={`border-t pt-3 ${darkMode ? "border-slate-600" : "border-blue-100"}`}>
                <button
                  onClick={handleImportClick}
                  disabled={importing}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium ${importing ? "opacity-50 cursor-not-allowed" : ""} ${darkMode ? "bg-slate-600 text-gray-200 hover:bg-slate-500" : "bg-white text-gray-700 hover:bg-gray-50"} border ${darkMode ? "border-slate-500" : "border-gray-300"}`}
                >
                  {importing ? "Importing..." : "Import New Clients Only"}
                </button>
                <p className={`text-[11px] mt-1.5 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  One-time import of new Wealthbox contacts not already in the app. Existing clients are not affected.
                </p>
              </div>

              {testStatus && (
                <div className={`text-xs p-2 rounded ${testStatus.startsWith("Connected") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {testStatus}
                </div>
              )}

              {syncStatus && (
                <div className={`text-xs p-2 rounded ${syncStatus.startsWith("Synced") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {syncStatus}
                </div>
              )}

              {importStatus && (
                <div className={`text-xs p-2 rounded ${importStatus.startsWith("Imported") || importStatus.startsWith("No new") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {importStatus}
                </div>
              )}

              {settings.lastWealthboxSync && (
                <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  Last synced: {settings.lastWealthboxSync}
                </div>
              )}

              <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"} space-y-1`}>
                <p><strong>Setup Required in Wealthbox:</strong></p>
                <p>Create these custom fields for contacts:</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li><code className="text-[10px]">ffo_health_score</code> (number)</li>
                  <li><code className="text-[10px]">ffo_status</code> (text)</li>
                  <li><code className="text-[10px]">ffo_last_scored</code> (date)</li>
                  <li><code className="text-[10px]">ffo_tier</code> (text)</li>
                  <li><code className="text-[10px]">ffo_monthly_fee</code> (number)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin: Scoring Config */}
      {canConfigureScoring(currentUser) && <div>
        <h4 className={`text-base font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Scoring Configuration</h4>
        <p className={`text-xs mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Configure the health score thresholds. Dimension weights are locked for consistency across the team.</p>

        <div className={`p-4 rounded-lg border ${darkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-200"}`}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>At-Risk Threshold (below this = AT RISK)</label>
              <input type="number" min="1" max="10" step="0.5" value={scAtRisk} onChange={e => setScAtRisk(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-600 border-slate-500 text-gray-200" : "border-gray-200 bg-white"}`} />
            </div>
            <div>
              <label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Watch Threshold (below this = WATCH)</label>
              <input type="number" min="1" max="10" step="0.5" value={scWatch} onChange={e => setScWatch(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-600 border-slate-500 text-gray-200" : "border-gray-200 bg-white"}`} />
            </div>
          </div>

          <h5 className={`text-xs font-semibold mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>DIMENSION WEIGHTS (locked)</h5>
          <div className={`space-y-1.5 mb-3 rounded-lg p-3 ${darkMode ? "bg-slate-800 border border-slate-600" : "bg-white border border-gray-200"}`}>
            {DIMENSIONS.map(dim => (
              <div key={dim} className="flex items-center gap-2">
                <span className={`text-xs flex-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{dim}</span>
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${darkMode ? "bg-slate-700" : "bg-gray-100"}`}>
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${(lockedWeights[dim] || 0) * 200}%` }} />
                </div>
                <span className={`text-xs w-12 text-right font-mono font-semibold ${darkMode ? "text-gray-200" : "text-gray-800"}`}>{Math.round((lockedWeights[dim] || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* Save Button */}
      <div className={`flex gap-2 pt-4 border-t ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
        <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Save Settings</button>
        <button onClick={() => { setSources(settings.referralSources || REFERRAL_SOURCES); setWbEnabled(settings.wealthboxEnabled || false); }} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Reset</button>
      </div>
    </div>

    {/* Import Dialog */}
    {importDialog.open && (
      <ImportDialog
        clients={importDialog.clients}
        onConfirm={handleImportConfirm}
        onCancel={handleImportCancel}
        darkMode={darkMode}
      />
    )}
  </div>;
}

// ===== CLIENT DETAIL =====
function ClientDetail({ client, scores, wows, referrals, onBack, onScore, onAddWow, onEditClient, onExportPDF, user, darkMode, settings }: {
  client: ClientStat; scores: Score[]; wows: Wow[]; referrals: Referral[];
  onBack: () => void; onScore: () => void; onAddWow: () => void; onEditClient: () => void; onExportPDF: () => void; user?: UserProfile; darkMode?: boolean; settings?: Settings;
}) {
  const cs = (scores || []).filter(s => s.clientId === client.id).sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  const latest = cs.length > 0 ? cs[cs.length - 1] : null;
  const prev = cs.length > 1 ? cs[cs.length - 2] : null;
  const ls = latest ? calcScore(latest.scores) : null;
  const ps = prev ? calcScore(prev.scores) : null;
  const st = getStatus(ls, settings);
  const cw = (wows || []).filter(w => w.clientId === client.id);
  const cr = (referrals || []).filter(r => r.referrerId === client.id);
  const trend = cs.map(s => ({ label: `${MO[s.month]} ${s.year}`, score: calcScore(s.scores) || 0 }));
  const cH = 120;

  // Exec Summary state
  const [execSummary, setExecSummary] = useState<ExecSummary | null>(null);
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState("");

  const handleLoadExecSummary = async () => {
    setExecLoading(true);
    setExecError("");
    try {
      const summary = await fetchExecSummary(
        client.id, client.wealthboxId || "", client.lastScoredTs,
        client.slackChannelId, client.name,
      );
      setExecSummary(summary);
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Failed to load exec summary");
    } finally {
      setExecLoading(false);
    }
  };

  const effectiveWeights = getEffectiveWeights(settings);

  return <div className="space-y-4 sm:space-y-5">
    <button onClick={onBack} className="text-sm text-blue-600 hover:text-blue-800">{"\u2190"} Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className={`text-lg sm:text-xl font-bold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>{client.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs sm:text-sm px-2 py-0.5 rounded ${darkMode ? "bg-slate-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{client.tier}</span>
            <span className={`text-xs sm:text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{client.leadAdvisor}</span>
            <span className={`text-xs sm:text-sm ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{fmtM(client.monthlyFee)}/mo</span>
            <span className={`text-xs sm:text-sm ${darkMode ? "text-gray-400" : "text-gray-400"}`}>Since {client.onboardDate}</span>
          </div>
          {client.referralSource && <div className={`text-xs mt-1 ${darkMode ? "text-blue-400" : "text-blue-600"}`}>Source: {client.referralSource}{client.referredBy ? ` (${client.referredBy})` : ""}</div>}
          {client.anniversaryDays != null && client.anniversaryDays <= 60 && <div className={`text-xs mt-1 ${darkMode ? "text-purple-400" : "text-purple-600"}`}>{"🎂"} Anniversary: {client.nextAnniversary} ({client.anniversaryDays === 0 ? "TODAY!" : `in ${client.anniversaryDays} days`})</div>}
          {client.latestNPS != null && <div className={`text-xs mt-1`} style={{ color: npsColor(client.latestNPS) }}>NPS: {client.latestNPS} ({npsCategory(client.latestNPS)})</div>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3"><ScoreCircle score={ls} size={48} settings={settings} /><div><Badge status={st} /><div className="flex items-center gap-1 mt-1"><TrendArrow cur={ls} prev={ps} /><span className="text-xs text-gray-400 hidden sm:inline">vs prior</span></div></div></div>
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        {canScore(user) && <button onClick={onScore} className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700">+ Score</button>}
        {canScore(user) && <button onClick={onAddWow} className="bg-amber-500 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-600">+ Wow</button>}
        {canEdit(user) && <button onClick={onEditClient} className={`border text-gray-600 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm hover:bg-gray-50 ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200"}`}>Edit</button>}
        {canExport(user) && <button onClick={onExportPDF} className="border border-blue-200 text-blue-600 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm hover:bg-blue-50 font-medium">Export PDF</button>}
      </div>
    </div>

    {/* Exec Summary */}
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>EXEC SUMMARY</h3>
        <button onClick={handleLoadExecSummary} disabled={execLoading} className={`text-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${execLoading ? "opacity-50" : ""} ${execSummary ? (darkMode ? "text-gray-400 hover:text-blue-400 hover:bg-slate-700" : "text-gray-400 hover:text-blue-600 hover:bg-gray-100") : "bg-blue-600 text-white hover:bg-blue-700"}`}>
          <span className={execLoading ? "animate-spin inline-block" : ""}>{"\u21BB"}</span>
          {!execSummary && !execLoading && <span className="text-xs font-medium">Generate Briefing</span>}
        </button>
      </div>

      {execLoading && <div className={`text-sm py-4 text-center ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Gathering data from Wealthbox{client.slackChannelId ? " + Slack" : ""} and generating briefing...</div>}
      {execError && !execLoading && <div><p className="text-sm text-red-500 mb-2">{execError}</p><button onClick={handleLoadExecSummary} className="text-xs text-blue-600 hover:text-blue-800">Retry</button></div>}

      {execSummary && !execLoading && (
        <div className="space-y-4">
          {/* AI Narrative Briefing — the main event */}
          <div className={`rounded-lg p-4 ${darkMode ? "bg-slate-700/50 border border-slate-600" : "bg-blue-50/50 border border-blue-100"}`}>
            <div className={`text-sm leading-relaxed whitespace-pre-line ${darkMode ? "text-gray-200" : "text-gray-800"}`} dangerouslySetInnerHTML={{ __html: execSummary.narrative.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>

          {/* Collapsible raw data */}
          <details className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            <summary className="cursor-pointer hover:text-blue-600 font-medium py-1">View source data ({execSummary.achievementsSinceLastCheckin.length} completed, {execSummary.currentPriorities.length} priorities, {execSummary.outstandingItems.length} overdue, {execSummary.emailThreads.length} comms{execSummary.slackMessages.length > 0 ? `, ${execSummary.slackMessages.length} Slack msgs` : ""})</summary>
            <div className="mt-3 space-y-3">
              {execSummary.achievementsSinceLastCheckin.length > 0 && <div>
                <h4 className={`text-xs font-semibold mb-1 ${darkMode ? "text-green-400" : "text-green-700"}`}>Completed Tasks</h4>
                {execSummary.achievementsSinceLastCheckin.map((a, i) => (
                  <div key={i} className={`text-xs py-0.5 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{"\u2713"} {a.name} <span className={darkMode ? "text-gray-500" : "text-gray-400"}>({new Date(a.completedAt).toLocaleDateString()})</span></div>
                ))}
              </div>}
              {execSummary.currentPriorities.length > 0 && <div>
                <h4 className={`text-xs font-semibold mb-1 ${darkMode ? "text-blue-400" : "text-blue-700"}`}>Open Priorities</h4>
                {execSummary.currentPriorities.map((p, i) => (
                  <div key={i} className={`text-xs py-0.5 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{"\u2022"} {p.name}{p.dueDate ? ` (due ${new Date(p.dueDate).toLocaleDateString()})` : ""}</div>
                ))}
              </div>}
              {execSummary.outstandingItems.length > 0 && <div>
                <h4 className={`text-xs font-semibold mb-1 ${darkMode ? "text-red-400" : "text-red-700"}`}>Overdue</h4>
                {execSummary.outstandingItems.map((o, i) => (
                  <div key={i} className={`text-xs py-0.5 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{"\u26A0"} {o.name}{o.dueDate ? ` (due ${new Date(o.dueDate).toLocaleDateString()})` : ""}</div>
                ))}
              </div>}
              {execSummary.emailThreads.length > 0 && <div>
                <h4 className={`text-xs font-semibold mb-1 ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Communication Log</h4>
                {execSummary.emailThreads.map((e, i) => (
                  <div key={i} className={`text-xs py-0.5 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>[{e.subject}] {e.from} — {e.snippet}</div>
                ))}
              </div>}
              {execSummary.slackMessages.length > 0 && <div>
                <h4 className={`text-xs font-semibold mb-1 ${darkMode ? "text-purple-400" : "text-purple-700"}`}>Slack Messages</h4>
                {execSummary.slackMessages.slice(-10).map((m, i) => (
                  <div key={i} className={`text-xs py-0.5 ${darkMode ? "text-gray-300" : "text-gray-600"}`}><span className="font-medium">{m.author}:</span> {m.text}</div>
                ))}
              </div>}
            </div>
          </details>

          <div className={`text-[10px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
            Generated {new Date(execSummary.generatedAt).toLocaleString()}
            {execSummary.lastCheckinDate && <> {"\u00B7"} Last check-in: {new Date(execSummary.lastCheckinDate).toLocaleDateString()}</>}
            {client.slackChannelId && <> {"\u00B7"} Slack: connected</>}
          </div>
        </div>
      )}

      {!execSummary && !execLoading && !execError && (
        <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          Generates an AI briefing from {client.wealthboxId ? "Wealthbox (tasks, emails, notes)" : "available data"}{client.slackChannelId ? " + Slack" : ""}. Summarizes where the client is at, what&apos;s been done, and what balls are in whose court.
        </p>
      )}
    </div>

    {latest && <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>DIMENSION BREAKDOWN</h3>
      {DIMENSIONS.map(dim => {
        const avg = dimAvg(latest.scores, dim);
        return <div key={dim} className="mb-3">
          <div className="flex justify-between mb-1"><span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{dim} ({((effectiveWeights[dim] || 0) * 100).toFixed(0)}%)</span><span className="text-sm font-semibold" style={{ color: sColor(getStatus(avg, settings)).tx }}>{avg != null ? avg.toFixed(1) : "\u2014"}</span></div>
          <div className="grid grid-cols-1 gap-1 ml-3 sm:grid-cols-2 lg:grid-cols-3">{METRICS.filter(m => m.dim === dim).map(m => <div key={m.id} className="flex items-center gap-2"><span className={`text-xs whitespace-nowrap ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{m.name}</span><MiniBar value={latest.scores[m.id]} /></div>)}</div>
        </div>;
      })}
    </div>}

    {trend.length > 1 && <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>TREND</h3>
      <div className="relative" style={{ height: cH + 40 }}>
        {[2, 5, 7, 10].map(v => <div key={v} className="absolute left-8 right-0 border-t border-gray-100" style={{ top: cH - (v / 10) * cH }}><span className="text-[10px] text-gray-300 absolute -left-8">{v}</span></div>)}
        <svg className="absolute left-8 right-0" style={{ top: 0, height: cH, width: "calc(100% - 2rem)" }} viewBox={`0 0 ${(trend.length - 1) * 100} ${cH}`} preserveAspectRatio="none">
          <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" points={trend.map((d, i) => `${i * 100},${cH - (d.score / 10) * cH}`).join(" ")} />
          {trend.map((d, i) => <circle key={i} cx={i * 100} cy={cH - (d.score / 10) * cH} r="4" fill="#3b82f6" />)}
        </svg>
        <div className="absolute left-8 right-0 flex justify-between" style={{ top: cH + 4 }}>{trend.map((d, i) => <span key={i} className="text-[10px] text-gray-400">{d.label}</span>)}</div>
      </div>
    </div>}

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>HISTORY</h3>
      {[...cs].reverse().map((s, i) => { const score = calcScore(s.scores); const sst = getStatus(score, settings); return <div key={i} className={`border rounded-lg p-3 mb-2 ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
        <div className="flex justify-between mb-1"><div className="flex items-center gap-2"><span className={`font-medium text-sm ${darkMode ? "text-gray-200" : "text-gray-900"}`}>{MO[s.month]} {s.year}</span><Badge status={sst} sm /></div><span className="font-bold text-lg" style={{ color: sColor(sst).tx }}>{score?.toFixed(2)}</span></div>
        {s.notes && <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{s.notes}</p>}{s.actionItems && <p className={`text-xs font-medium ${darkMode ? "text-amber-400" : "text-amber-700"}`}>{s.actionItems}</p>}<div className={`text-[10px] mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>By {s.assessor}</div>
      </div>; })}
      {cs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No scores yet.</p>}
    </div>

    {cr.length > 0 && <div className={`rounded-xl border border-blue-200 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-blue-400" : "text-blue-700"}`}>REFERRALS GENERATED ({cr.length})</h3>
      {cr.map(r => <div key={r.id} className={`text-sm py-1 border-b last:border-0 ${darkMode ? "border-slate-700" : "border-gray-100"}`}><span className={darkMode ? "text-gray-300" : "text-gray-700"}>{r.notes}</span><span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${r.status === "Active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</span>{r.revenueGenerated > 0 && <span className="ml-2 text-green-700 font-bold">{fmtM(r.revenueGenerated)}/mo</span>}</div>)}
    </div>}

    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <div className="flex justify-between mb-3"><h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-500"}`}>WOW MOMENTS</h3>{canScore(user) && <button onClick={onAddWow} className="text-xs text-amber-600 font-medium">+ Add</button>}</div>
      {cw.map(w => <div key={w.id} className="border border-amber-100 bg-amber-50 rounded-lg p-3 mb-2"><div className="flex items-center gap-2 mb-1"><span className="text-xs px-2 py-0.5 rounded bg-amber-200 text-amber-800 font-medium">{w.type}</span><span className="text-xs text-gray-400">{w.date} {"\u00B7"} {w.owner}</span></div><p className="text-sm text-gray-800">{w.description}</p>{w.reaction && <p className="text-xs text-amber-700 italic mt-1">{"\u21AA"} {w.reaction}</p>}</div>)}
      {cw.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No wow moments.</p>}
    </div>
  </div>;
}

// ===== SCORING FORM =====
function ScoringForm({ client, existingScore, onSave, onCancel, darkMode, settings, wows }: { client: Client; existingScore?: Score; onSave: (s: Score) => void; onCancel: () => void; darkMode?: boolean; settings?: Settings; wows?: Wow[] }) {
  const now = new Date();
  const isQuarterly = SCORING_FREQUENCY[client.tier] === "quarterly";
  const [month, setMonth] = useState(existingScore?.month ?? (isQuarterly ? quarterStartMonth(quarterFromMonth(now.getMonth())) : now.getMonth()));
  const [quarter, setQuarter] = useState(existingScore ? quarterFromMonth(existingScore.month) : quarterFromMonth(now.getMonth()));
  const [year, setYear] = useState(existingScore?.year ?? now.getFullYear());
  const [scoreVals, setScoreVals] = useState(existingScore?.scores ?? Array(METRIC_COUNT).fill(5));
  const [assessor, setAssessor] = useState(existingScore?.assessor ?? "");
  const [notes, setNotes] = useState(existingScore?.notes ?? "");
  const [actions, setActions] = useState(existingScore?.actionItems ?? "");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [dimJustifications, setDimJustifications] = useState<Record<string, string>>({});
  const weighted = calcScore(scoreVals); const status = getStatus(weighted, settings);
  const upd = (i: number, v: string) => { const n = [...scoreVals]; n[i] = Math.max(1, Math.min(10, Number(v) || 5)); setScoreVals(n); };
  const effectiveWeights = getEffectiveWeights(settings);

  // For quarterly, the score stores the quarter start month
  const effectiveMonth = isQuarterly ? quarterStartMonth(quarter) : month;

  const handleAIScore = async () => {
    setAiLoading(true); setAiError("");
    try {
      const clientWows = (wows || []).filter(w => w.clientId === client.id);
      const result = await fetchAIScore(client.name, client.wealthboxId, client.slackChannelId, client.googleDriveFolderId, clientWows, effectiveMonth, year);
      setScoreVals(result.scores);
      setNotes(result.observations);
      setActions(result.actionItems);
      setDimJustifications(result.dimensionJustifications || {});
      setAssessor("AI");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI scoring failed");
    } finally { setAiLoading(false); }
  };

  return <div className="space-y-4 sm:space-y-5">
    <button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">{"\u2190"} Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h2 className={`text-base sm:text-lg font-bold mb-1 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Score: {client.name}</h2>
      <div className={`text-xs mb-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{isQuarterly ? "Quarterly" : "Monthly"} scoring ({client.tier})</div>
      <div className="flex gap-3 mb-4 flex-wrap items-end">
        {isQuarterly ? (
          <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Quarter</label><select className={`block border rounded px-2 py-1 text-sm mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={quarter} onChange={e => setQuarter(Number(e.target.value))}>{QUARTERS.map((q, i) => <option key={i} value={i}>{q}</option>)}</select></div>
        ) : (
          <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Month</label><select className={`block border rounded px-2 py-1 text-sm mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={month} onChange={e => setMonth(Number(e.target.value))}>{MO.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        )}
        <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Year</label><input type="number" className={`block border rounded px-2 py-1 text-sm w-20 mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={year} onChange={e => setYear(Number(e.target.value))} /></div>
        <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Assessor</label><select className={`block border rounded px-2 py-1 text-sm mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={assessor} onChange={e => setAssessor(e.target.value)}><option value="">Select...</option>{ADVISORS.map(a => <option key={a}>{a}</option>)}<option value="AI">AI</option></select></div>
        <button onClick={handleAIScore} disabled={aiLoading} className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${aiLoading ? "opacity-50" : ""} bg-purple-600 text-white hover:bg-purple-700`}>
          {aiLoading ? <span className="animate-spin inline-block">{"\u21BB"}</span> : <span>{"\u2728"}</span>}
          {aiLoading ? "Scoring..." : "AI Score"}
        </button>
      </div>
      {aiError && <div className="text-sm text-red-500 mb-3">{aiError}</div>}
      <div className="flex items-center gap-4 p-3 rounded-lg mb-4" style={{ background: sColor(status).bg, border: `1px solid ${sColor(status).bd}` }}><ScoreCircle score={weighted} size={52} settings={settings} /><div><div className="text-sm font-semibold" style={{ color: sColor(status).tx }}>{status || "Score all metrics"}</div><div className="text-xs text-gray-500">Weighted: {weighted?.toFixed(2)}</div></div></div>
      {DIMENSIONS.map(dim => <div key={dim} className="mb-4"><h3 className={`text-sm font-semibold mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{dim} <span className={`font-normal text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>({((effectiveWeights[dim] || 0) * 100).toFixed(0)}%)</span></h3>
        {dimJustifications[dim] && <div className={`text-xs mb-3 px-3 py-2 rounded-lg italic ${darkMode ? "bg-purple-900/20 text-purple-300 border border-purple-800/30" : "bg-purple-50 text-purple-700 border border-purple-100"}`}>{dimJustifications[dim]}</div>}
        {METRICS.filter(m => m.dim === dim).map(m => <div key={m.id} className="mb-3"><div className="flex items-center gap-2 mb-1"><div className={`w-40 text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{m.name} ({(m.weight * 100).toFixed(0)}%)</div><input type="range" min="1" max="10" value={scoreVals[m.id] ?? 5} onChange={e => upd(m.id, e.target.value)} className="flex-1 h-2 accent-blue-600" /><input type="number" min="1" max="10" value={scoreVals[m.id] ?? 5} onChange={e => upd(m.id, e.target.value)} className={`w-12 text-center border rounded text-sm py-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} /></div><div className={`text-[10px] ml-1 leading-tight ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{m.helper}</div></div>)}
      </div>)}
      <div className={`space-y-3 mt-4 pt-4 border-t ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Observations</label><textarea className={`w-full border rounded-lg p-2 text-sm h-20 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Action Items</label><textarea className={`w-full border rounded-lg p-2 text-sm h-16 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={actions} onChange={e => setActions(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ clientId: client.id, year, month: effectiveMonth, scores: scoreVals, assessor, notes, actionItems: actions, ts: new Date().toISOString() })} disabled={!assessor} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save</button>
        <button onClick={onCancel} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Cancel</button>
      </div>
    </div>
  </div>;
}

// ===== CLIENT FORM (with referral fields) =====
function ClientForm({ client, onSave, onCancel, referralSources, darkMode, settings }: { client?: Client; onSave: (c: Client) => void; onCancel: () => void; referralSources?: string[]; darkMode?: boolean; settings?: Settings }) {
  const sources = referralSources || REFERRAL_SOURCES;
  const allPods = getPods(settings);
  const [name, setName] = useState(client?.name ?? "");
  const [tier, setTier] = useState(client?.tier ?? TIERS[0]);
  const [date, setDate] = useState(client?.onboardDate ?? new Date().toISOString().slice(0, 10));
  const [mFee, setMFee] = useState(client?.monthlyFee ?? TIER_REVENUE[TIERS[0]]);
  const [refSrc, setRefSrc] = useState(client?.referralSource ?? "");
  const [refBy, setRefBy] = useState(client?.referredBy ?? "");
  const [wbId, setWbId] = useState(client?.wealthboxId ?? "");
  const [pod, setPod] = useState(client?.pod ?? "");
  const [slackCh, setSlackCh] = useState(client?.slackChannelId ?? "");
  const [gdFolderId, setGdFolderId] = useState(client?.googleDriveFolderId ?? "");
  const [clientStatus, setClientStatus] = useState<"Active" | "Paused" | "Offboarded">(client?.engagementStatus ?? "Active");
  const selectedPod = allPods.find(p => p.id === pod);

  return <div className="space-y-5">
    <button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">{"\u2190"} Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 max-w-lg ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>{client ? "Edit Client" : "Add Client"}</h2>
      <div className="space-y-3">
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Name</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Tier</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={tier} onChange={e => { setTier(e.target.value); if (!client) setMFee(TIER_REVENUE[e.target.value] || 5000); }}>{TIERS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Pod</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={pod} onChange={e => setPod(e.target.value)}><option value="">Select pod...</option>{allPods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        {selectedPod && <div className={`text-xs px-3 py-2 rounded-lg ${darkMode ? "bg-slate-700 text-gray-400" : "bg-gray-50 text-gray-500"}`}>
          Advisor: {selectedPod.advisor} | WP: {selectedPod.wp} | WPA: {selectedPod.wpa}{selectedPod.partner ? ` | Partner: ${selectedPod.partner}` : ""}
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Onboard Date</label><input type="date" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Monthly Fee ($)</label><input type="number" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={mFee} onChange={e => setMFee(Number(e.target.value) || 0)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Referral Source</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={refSrc} onChange={e => setRefSrc(e.target.value)}><option value="">Select...</option>{sources.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Referred By</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-500" : "border-gray-200 bg-white"}`} value={refBy} onChange={e => setRefBy(e.target.value)} placeholder="Client name or COI" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Wealthbox Contact ID</label><input className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-500" : "border-gray-200 bg-white"}`} value={wbId} onChange={e => setWbId(e.target.value)} placeholder="Wealthbox contact ID" /></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Slack Channel ID</label><input className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-500" : "border-gray-200 bg-white"}`} value={slackCh} onChange={e => setSlackCh(e.target.value)} placeholder="e.g. C0ABCDEF123" /></div>
        </div>
        <div>
          <label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Google Drive Folder ID</label><input className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-500" : "border-gray-200 bg-white"}`} value={gdFolderId} onChange={e => setGdFolderId(e.target.value)} placeholder="Folder ID from Google Drive URL" />
        </div>
        <div>
          <label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Client Status</label>
          <div className="flex gap-2">
            {(["Active", "Paused", "Offboarded"] as const).map(s => {
              const active = clientStatus === s;
              const col = s === "Active" ? "green" : s === "Paused" ? "amber" : "red";
              return <button key={s} type="button" onClick={() => setClientStatus(s)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${active ? (col === "green" ? "bg-green-600 text-white border-green-600" : col === "amber" ? "bg-amber-500 text-white border-amber-500" : "bg-red-600 text-white border-red-600") : (darkMode ? "bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}`}>{s}</button>;
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => {
          const statusChanged = (client?.engagementStatus || "Active") !== clientStatus;
          onSave({
            id: client?.id || ("c" + Date.now()),
            name, tier, leadAdvisor: selectedPod?.advisor || client?.leadAdvisor || "",
            onboardDate: date, monthlyFee: mFee, referralSource: refSrc, referredBy: refBy,
            wealthboxId: wbId || undefined, pod: pod || undefined,
            wpa: selectedPod?.wpa || undefined,
            slackChannelId: slackCh || undefined,
            googleDriveFolderId: gdFolderId || undefined,
            engagementStatus: clientStatus,
            engagementStatusChangedAt: statusChanged ? new Date().toISOString() : client?.engagementStatusChangedAt,
          });
        }} disabled={!name.trim() || !pod} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save</button>
        <button onClick={onCancel} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Cancel</button>
      </div>
    </div>
  </div>;
}

// ===== WOW FORM =====
function WowForm({ clientId, onSave, onCancel, darkMode }: { clientId: string; onSave: (w: Wow) => void; onCancel: () => void; darkMode?: boolean }) {
  const [desc, setDesc] = useState(""); const [type, setType] = useState("Proactive"); const [owner, setOwner] = useState(""); const [reaction, setReaction] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return <div className="space-y-5"><button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">{"\u2190"} Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 max-w-lg ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}><h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Log Wow Moment</h2>
      <div className="space-y-3">
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Description</label><textarea className={`w-full border rounded-lg px-3 py-2 text-sm h-20 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={desc} onChange={e => setDesc(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-3"><div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Type</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={type} onChange={e => setType(e.target.value)}>{WOW_TYPES.map(t => <option key={t}>{t}</option>)}</select></div><div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Owner</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={owner} onChange={e => setOwner(e.target.value)} /></div><div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Date</label><input type="date" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={date} onChange={e => setDate(e.target.value)} /></div></div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Reaction</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={reaction} onChange={e => setReaction(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button onClick={() => onSave({ id: "w" + Date.now(), clientId, date, description: desc, type, owner, reaction })} disabled={!desc.trim() || !owner.trim()} className="bg-amber-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40">Save</button><button onClick={onCancel} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Cancel</button></div>
    </div>
  </div>;
}

// ===== REFERRAL FORM =====
function ReferralForm({ clients, onSave, onCancel, referralSources, darkMode }: { clients: Client[]; onSave: (r: Referral) => void; onCancel: () => void; referralSources?: string[]; darkMode?: boolean }) {
  const sources = referralSources || REFERRAL_SOURCES;
  const [referrerId, setReferrerId] = useState(""); const [referredId, setReferredId] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(sources[0]); const [status, setStatus] = useState("Prospect"); const [notes, setNotes] = useState(""); const [rev, setRev] = useState(0);
  return <div className="space-y-5"><button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">{"\u2190"} Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 max-w-lg ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}><h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Log Referral</h2>
      <div className="space-y-3">
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Referring Client</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={referrerId} onChange={e => setReferrerId(e.target.value)}><option value="">Select...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Referred Client (if converted)</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={referredId} onChange={e => setReferredId(e.target.value)}><option value="">Prospect (not yet a client)</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Source</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={source} onChange={e => setSource(e.target.value)}>{sources.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Status</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={status} onChange={e => setStatus(e.target.value)}><option>Active</option><option>Prospect</option><option>Lost</option></select></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Date</label><input type="date" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Revenue Generated ($/mo)</label><input type="number" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={rev} onChange={e => setRev(Number(e.target.value) || 0)} /></div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Notes</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button onClick={() => onSave({ id: "r" + Date.now(), referrerId, referredClientId: referredId, date, source, status, notes, revenueGenerated: rev })} disabled={!referrerId} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save</button><button onClick={onCancel} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Cancel</button></div>
    </div>
  </div>;
}

// ===== MAIN APP =====
export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState("dashboard");
  const [tab, setTab] = useState("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEFAULT_USERS[0]);
  const [darkMode, setDarkMode] = useState(false);

  // For baseline auto-advance
  const [baselineAutoAdvance, setBaselineAutoAdvance] = useState(false);

  useEffect(() => {
    loadData().then(d => {
      setData(d);
      setLoading(false);
      // Auto-import any pending NPS survey responses
      fetchPendingNPSSurveys().then(pending => {
        if (pending.length > 0) {
          const existing = new Set((d.npsFeedback || []).map(f => f.id));
          const newFeedback = pending.filter(f => !existing.has(f.id));
          if (newFeedback.length > 0) {
            const updated = { ...d, npsFeedback: [...(d.npsFeedback || []), ...newFeedback] };
            setData(updated);
            saveData(updated);
          }
        }
      });
    });
    const savedTheme = localStorage.getItem("ffo-theme");
    if (savedTheme === "dark") setDarkMode(true);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem("ffo-theme", newMode ? "dark" : "light");
  };

  const persist = useCallback(async (nd: AppData) => { setData(nd); saveData(nd); }, []);

  const visibleClients = useMemo(() => filterByAdvisor(data?.clients || [], currentUser), [data?.clients, currentUser]);
  const stats = useClientStats(visibleClients, data?.scores || [], data?.npsFeedback || [], data?.settings);
  const selected = data ? (data.clients || []).find(c => c.id === selectedId) : null;
  const selectedStat = stats.find(c => c.id === selectedId);
  const alertCount = stats.filter(c => c.status === "AT RISK").length + stats.filter(c => c.anniversaryDays != null && c.anniversaryDays <= 30).length;

  if (loading) return <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"} flex flex-col items-center justify-center gap-3`}><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-gray-400 font-medium tracking-wide">Loading</span></div>;
  if (!data) return null;

  const go = (id: string) => { setSelectedId(id); setView("detail"); };
  const back = () => { setView("dashboard"); setSelectedId(null); };

  const handleSaveScore = async (s: Score) => {
    const idx = data.scores.findIndex(x => x.clientId === s.clientId && x.year === s.year && x.month === s.month);
    const existingScores = Array.isArray(data.scores) ? data.scores : [];
    const existingClients = Array.isArray(data.clients) ? data.clients : [];
    const ns = [...existingScores]; if (idx >= 0) ns[idx] = s; else ns.push(s);

    // Mark baseline completed if first score for this client
    const clientScoreCount = existingScores.filter(x => x.clientId === s.clientId).length;
    let updatedClients = existingClients;
    if (clientScoreCount === 0 || (idx < 0 && clientScoreCount === 0)) {
      updatedClients = existingClients.map(c =>
        c.id === s.clientId ? { ...c, baselineCompletedAt: c.baselineCompletedAt || new Date().toISOString() } : c
      );
    }

    await persist({ ...data, scores: ns, clients: updatedClients });

    // Push to Wealthbox if enabled and client has wealthboxId
    const client = existingClients.find(c => c.id === s.clientId);
    if (data.settings?.wealthboxEnabled && client?.wealthboxId) {
      const score = calcScore(s.scores);
      if (score !== null) {
        const status = getStatus(score, data.settings) || "WATCH";
        const dims = {
          engagement: dimAvg(s.scores, "Engagement") || 0,
          responsiveness: dimAvg(s.scores, "Responsiveness") || 0,
          profitability: dimAvg(s.scores, "Profitability") || 0,
          advocacy: dimAvg(s.scores, "Advocacy") || 0,
          retention: dimAvg(s.scores, "Retention Risk") || 0,
        };
        try {
          await pushScoreToWealthbox(client.wealthboxId, score, status, dims);
        } catch (error) {
          console.error('Failed to push score to Wealthbox:', error);
        }
      }
    }

    // If baseline auto-advance, find next unscored client
    if (baselineAutoAdvance) {
      const allStats = visibleClients.map(c => {
        const scoreCount = ns.filter(x => x.clientId === c.id).length;
        return { ...c, scoreCount };
      });
      const nextUnscored = allStats.find(c => c.scoreCount === 0 && c.id !== s.clientId);
      if (nextUnscored) {
        setSelectedId(nextUnscored.id);
        setView("score");
        return;
      }
      // All done, go back to baseline tab
      setBaselineAutoAdvance(false);
      setView("dashboard");
      setTab("overview");
      setSelectedId(null);
      return;
    }

    setView("detail");
  };

  const handleSaveClient = async (c: Client) => {
    const existing = Array.isArray(data.clients) ? data.clients : [];
    const idx = existing.findIndex(x => x.id === c.id);
    const nc = [...existing];
    if (idx >= 0) { nc[idx] = { ...nc[idx], ...c }; } else nc.push(c);
    await persist({ ...data, clients: nc });
    if (view === "addClient") { setSelectedId(c.id); setView("detail"); } else setView("detail");
  };

  const handleSaveWow = async (w: Wow) => { await persist({ ...data, wows: [...(data.wows || []), w] }); setView("detail"); };
  const handleSaveRef = async (r: Referral) => { await persist({ ...data, referrals: [...(data.referrals || []), r] }); setView("dashboard"); setTab("overview"); };

  const handleAddNPSFeedback = async (fb: NPSFeedback) => {
    const updated = [...(data.npsFeedback || []), fb];
    await persist({ ...data, npsFeedback: updated });
  };

  const handleImportNPSSurveys = async (): Promise<number> => {
    const pending = await fetchPendingNPSSurveys();
    if (pending.length === 0) return 0;
    const existing = new Set((data.npsFeedback || []).map(f => f.id));
    const newFeedback = pending.filter(f => !existing.has(f.id));
    if (newFeedback.length > 0) {
      await persist({ ...data, npsFeedback: [...(data.npsFeedback || []), ...newFeedback] });
    }
    return newFeedback.length;
  };

  const handleExportClientPDF = () => {
    if (!selectedStat) return;
    exportClientPDF(selectedStat, data.scores, data.wows, data.referrals || []);
  };

  const handleExportPortfolioPDF = () => { exportPortfolioPDF(stats, data.referrals || []); };

  const handleSaveSettings = async (settings: Settings) => {
    await persist({ ...data, settings });
  };

  const handleCSVImport = async (clients: Client[]) => {
    const existing = Array.isArray(data.clients) ? data.clients : [];
    const mergedClients = [...existing, ...clients];
    await persist({ ...data, clients: mergedClients });
  };

  const handleWealthboxSync = async () => {
    try {
      const wealthboxClients = await syncFromWealthbox();
      const existing = Array.isArray(data.clients) ? data.clients : [];

      const updatedClients = existing.map(existingClient => {
        if (!existingClient.wealthboxId) return existingClient;
        const wealthboxClient = wealthboxClients.find(wc => wc.wealthboxId === existingClient.wealthboxId);
        if (!wealthboxClient) return existingClient;
        return {
          ...existingClient,
          tier: wealthboxClient.tier,
          leadAdvisor: wealthboxClient.leadAdvisor,
          monthlyFee: wealthboxClient.monthlyFee,
          onboardDate: wealthboxClient.onboardDate,
          referralSource: wealthboxClient.referralSource,
          referredBy: wealthboxClient.referredBy,
        };
      });

      const existingWealthboxIds = new Set(existing.map(c => c.wealthboxId).filter(Boolean));
      const newClients = wealthboxClients.filter(wc => !existingWealthboxIds.has(wc.wealthboxId));

      const mergedClients = [...updatedClients, ...newClients];
      await persist({ ...data, clients: mergedClients });
    } catch (error) {
      console.error('Wealthbox sync error:', error);
      throw error;
    }
  };

  const handleWealthboxImport = async (selectedClients: Client[]): Promise<number> => {
    try {
      if (selectedClients.length > 0) {
        const existing = Array.isArray(data.clients) ? data.clients : [];
        const mergedClients = [...existing, ...selectedClients];
        await persist({ ...data, clients: mergedClients });
      }
      return selectedClients.length;
    } catch (error) {
      console.error('Wealthbox import error:', error);
      throw error;
    }
  };

  const handleBaselineScore = (clientId: string) => {
    setSelectedId(clientId);
    setBaselineAutoAdvance(true);
    setView("score");
  };

  const handleReset = async () => {
    await persist({
      clients: DEFAULT_CLIENTS, scores: DEFAULT_SCORES, wows: DEFAULT_WOWS,
      referrals: DEFAULT_REFERRALS, npsFeedback: DEFAULT_NPS,
      settings: { referralSources: REFERRAL_SOURCES, pods: DEFAULT_PODS }
    });
    setView("dashboard"); setSelectedId(null); setTab("overview");
  };

  const roleBg = currentUser.role === "admin" ? "bg-blue-100 text-blue-700" : currentUser.role === "advisor" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";

  return <div className={`min-h-screen ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
    <div className={`${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-b sticky top-0 z-20`}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={back}>
            <img src={darkMode ? "/ffo-logo-white.png" : "/ffo-logo.png"} alt="FFO Logo" className="h-8 sm:h-10 w-auto" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className={`text-xs hidden md:inline ${darkMode ? "text-white" : "text-gray-600"}`}>{visibleClients.length} clients {"\u00B7"} {fmtM(visibleClients.reduce((s, c) => s + getFee(c), 0))}/mo</span>
            {canExport(currentUser) && <button onClick={handleExportPortfolioPDF} className="text-xs text-blue-600 hover:text-blue-800 font-medium hidden md:inline">Portfolio PDF</button>}
            <select className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 rounded-lg font-medium ${roleBg}`} value={currentUser.id} onChange={e => { const u = DEFAULT_USERS.find(x => x.id === e.target.value); if (u) setCurrentUser(u); setView("dashboard"); setSelectedId(null); }}>
              {DEFAULT_USERS.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            <button onClick={toggleDarkMode} className={`text-base sm:text-lg ${darkMode ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"}`} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}</button>
          </div>
        </div>
      </div>
    </div>

    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
      {view === "dashboard" && <>
        <TabNav active={tab} onChange={setTab} alertCount={alertCount} darkMode={darkMode} />
        {tab === "overview" && <OverviewTab stats={stats} onSelect={go} onAdd={() => setView("addClient")} user={currentUser} darkMode={darkMode} settings={data.settings} />}
        {tab === "baseline" && <BaselineTab stats={stats} onScoreClient={handleBaselineScore} darkMode={darkMode} settings={data.settings} />}
        {tab === "ranking" && <RankingTab clients={visibleClients} scores={data.scores || []} onSelect={go} darkMode={darkMode} settings={data.settings} />}
        {tab === "advisors" && <AdvisorTab stats={stats} darkMode={darkMode} settings={data.settings} />}
        {tab === "pods" && <PodsTab stats={stats} onSelect={go} darkMode={darkMode} settings={data.settings} onSaveSettings={handleSaveSettings} />}
        {tab === "team" && <TeamTab stats={stats} onSelect={go} darkMode={darkMode} settings={data.settings} />}
        {tab === "compliance" && <ComplianceTab stats={stats} onSelect={go} darkMode={darkMode} />}
        {tab === "alerts" && <AlertsTab stats={stats} onSelect={go} darkMode={darkMode} />}
        {tab === "revenue" && <RevenueTab stats={stats} darkMode={darkMode} settings={data.settings} />}
        {tab === "referrals" && <ReferralsTab stats={stats} referrals={data.referrals || []} onAddRef={() => setView("addRef")} referralSources={getReferralSources(data.settings)} darkMode={darkMode} />}
        {tab === "activity" && <ActivityTab clients={visibleClients} scores={data.scores || []} wows={data.wows || []} npsFeedback={data.npsFeedback || []} currentUser={currentUser} darkMode={darkMode} settings={data.settings} />}
        {tab === "nps" && <NPSTab stats={stats} npsFeedback={data.npsFeedback || []} onAddFeedback={handleAddNPSFeedback} onImportSurveys={handleImportNPSSurveys} darkMode={darkMode} />}
        {tab === "settings" && <SettingsTab settings={data.settings || { referralSources: REFERRAL_SOURCES }} onSave={handleSaveSettings} onSync={handleWealthboxSync} onImport={handleWealthboxImport} onCSVImport={handleCSVImport} darkMode={darkMode} currentUser={currentUser} />}
      </>}

      {view === "detail" && selectedStat && <ClientDetail client={selectedStat} scores={data.scores || []} wows={data.wows || []} referrals={data.referrals || []} onBack={back} onScore={() => setView("score")} onAddWow={() => setView("addWow")} onEditClient={() => setView("editClient")} onExportPDF={handleExportClientPDF} user={currentUser} darkMode={darkMode} settings={data.settings} />}
      {view === "score" && selected && <ScoringForm client={selected} existingScore={(data.scores || []).find(s => {
        if (s.clientId !== selectedId || s.year !== new Date().getFullYear()) return false;
        const freq = SCORING_FREQUENCY[selected.tier];
        if (freq === "quarterly") return quarterFromMonth(s.month) === quarterFromMonth(new Date().getMonth());
        return s.month === new Date().getMonth();
      })} onSave={handleSaveScore} onCancel={() => { setBaselineAutoAdvance(false); if (selectedId) setView("detail"); else { setView("dashboard"); setTab("overview"); } }} darkMode={darkMode} settings={data.settings} wows={data.wows || []} />}
      {view === "addClient" && <ClientForm onSave={handleSaveClient} onCancel={back} referralSources={getReferralSources(data.settings)} darkMode={darkMode} settings={data.settings} />}
      {view === "editClient" && selected && <ClientForm client={selected} onSave={handleSaveClient} onCancel={() => setView("detail")} referralSources={getReferralSources(data.settings)} darkMode={darkMode} settings={data.settings} />}
      {view === "addWow" && selected && <WowForm clientId={selectedId!} onSave={handleSaveWow} onCancel={() => setView("detail")} darkMode={darkMode} />}
      {view === "addRef" && <ReferralForm clients={data.clients || []} onSave={handleSaveRef} onCancel={() => { setView("dashboard"); setTab("overview"); }} referralSources={getReferralSources(data.settings)} darkMode={darkMode} />}
    </div>
  </div>;
}
