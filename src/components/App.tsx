"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AppData, Client, Score, Wow, Referral, ClientStat, UserProfile, Settings,
  loadData, saveData, calcScore, dimAvg, getStatus, sColor, getFee, fmtM, timeAgo,
  getNextAnniversary, canScore, canEdit, canExport, canViewAllAdvisors, filterByAdvisor,
  getReferralSources, syncFromWealthbox, pushScoreToWealthbox, testWealthboxConnection,
  importNewClientsFromWealthbox,
  METRICS, DIMENSIONS, DIM_WEIGHTS, MO, TIERS, ADVISORS, WOW_TYPES, REFERRAL_SOURCES,
  CADENCE_DAYS, TIER_REVENUE, DEFAULT_USERS,
  DEFAULT_CLIENTS, DEFAULT_SCORES, DEFAULT_WOWS, DEFAULT_REFERRALS
} from "@/lib/data";
import { exportClientPDF, exportPortfolioPDF } from "@/lib/pdf";

// ===== SHARED UI =====
function Badge({ status, sm }: { status: string | null; sm?: boolean }) {
  const c = sColor(status);
  return <span className={`${sm ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"} rounded-full font-semibold inline-block`}
    style={{ background: c.bg, color: c.tx, border: `1px solid ${c.bd}` }}>{status || "—"}</span>;
}

function ScoreCircle({ score, size = 44 }: { score: number | null; size?: number }) {
  if (score == null) return <div style={{ width: size, height: size }} className="rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">—</div>;
  const c = sColor(getStatus(score));
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
  if (cur == null || prev == null) return <span className="text-gray-300 text-xs">—</span>;
  if (cur > prev) return <span className="text-green-600 text-sm font-bold">▲</span>;
  if (cur < prev) return <span className="text-red-500 text-sm font-bold">▼</span>;
  return <span className="text-gray-400 text-sm">●</span>;
}

function Sel({ label, value, onChange, options, darkMode }: { label?: string; value: string; onChange: (v: string) => void; options: string[]; darkMode?: boolean }) {
  return <div className="flex items-center gap-1.5">
    {label && <span className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{label}:</span>}
    <select className={`border rounded-lg px-2 py-1.5 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  </div>;
}

function StatCard({ label, value, color = "#111", sub, darkMode }: { label: string; value: string | number; color?: string; sub?: string; darkMode?: boolean }) {
  return <div className={`rounded-xl border p-2 sm:p-3 text-center ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
    <div className="text-xl sm:text-2xl font-bold" style={{ color: darkMode ? "#ffffff" : color }}>{value}</div>
    <div className={`text-[10px] sm:text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{label}</div>
    {sub && <div className={`text-[10px] sm:text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{sub}</div>}
  </div>;
}

// ===== TABS =====
const TABS = [
  { id: "overview", label: "Overview" }, { id: "ranking", label: "Ranking" },
  { id: "advisors", label: "Advisors" }, { id: "compliance", label: "Compliance" },
  { id: "alerts", label: "Alerts" }, { id: "revenue", label: "Revenue" },
  { id: "referrals", label: "Referrals" }, { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

function TabNav({ active, onChange, alertCount }: { active: string; onChange: (t: string) => void; alertCount: number }) {
  return <div className="flex gap-0.5 sm:gap-1 overflow-x-auto pb-1 mb-4 border-b border-gray-200 -mx-3 sm:mx-0 px-3 sm:px-0">
    {TABS.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg whitespace-nowrap ${active === t.id ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
        {t.label}
        {t.id === "alerts" && alertCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-red-500 text-white font-bold">{alertCount}</span>}
      </button>
    ))}
  </div>;
}

// ===== useClientStats =====
function useClientStats(clients: Client[], scores: Score[]): ClientStat[] {
  return useMemo(() => (clients || []).map(client => {
    const cs = (scores || []).filter(s => s.clientId === client.id).sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
    const latest = cs[0] || null; const prev = cs[1] || null;
    const latestScore = latest ? calcScore(latest.scores) : null;
    const prevScore = prev ? calcScore(prev.scores) : null;
    const status = getStatus(latestScore);
    const prevStatus = prev ? getStatus(calcScore(prev.scores)) : null;
    const dims = latest ? DIMENSIONS.map(d => ({ name: d, avg: dimAvg(latest.scores, d) })) : [];
    const dropped = !!(prevStatus && status && prevStatus === "HEALTHY" && (status === "WATCH" || status === "AT RISK"));
    const anniv = getNextAnniversary(client.onboardDate);
    return { ...client, monthlyFee: getFee(client), latestScore, prevScore, status, prevStatus, latest, dims, scoreCount: cs.length, lastScoredTs: latest?.ts || null, dropped, anniversaryDays: anniv?.days ?? null, nextAnniversary: anniv?.date ?? null };
  }), [clients, scores]);
}

// ===== OVERVIEW =====
function OverviewTab({ stats, onSelect, onAdd, user, darkMode }: { stats: ClientStat[]; onSelect: (id: string) => void; onAdd: () => void; user?: UserProfile; darkMode?: boolean }) {
  const [search, setSearch] = useState(""); const [fT, setFT] = useState("All"); const [fA, setFA] = useState("All"); const [fS, setFS] = useState("All");
  const [sortBy, setSortBy] = useState("Score (Low to High)");
  const filtered = stats.filter(c => (fT === "All" || c.tier === fT) && (fA === "All" || c.leadAdvisor === fA) && (fS === "All" || c.status === fS) && (!search || c.name.toLowerCase().includes(search.toLowerCase())));
  const scored = filtered.filter(c => c.latestScore != null);
  const avg = scored.length ? scored.reduce((s, c) => s + (c.latestScore || 0), 0) / scored.length : 0;
  const h = scored.filter(c => c.status === "HEALTHY").length;
  const w = scored.filter(c => c.status === "WATCH").length;
  const r = scored.filter(c => c.status === "AT RISK").length;
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Clients" value={filtered.length} darkMode={darkMode} />
      <StatCard label="Monthly Rev" value={fmtM(filtered.reduce((s, c) => s + c.monthlyFee, 0))} color="#1B2A4A" darkMode={darkMode} />
      <StatCard label="Avg Score" value={avg.toFixed(1)} color={sColor(getStatus(avg)).tx} darkMode={darkMode} />
      <StatCard label="Healthy" value={h} color="#166534" sub={scored.length ? `${Math.round(h / scored.length * 100)}%` : ""} darkMode={darkMode} />
      <StatCard label="Watch" value={w} color="#854d0e" sub={scored.length ? `${Math.round(w / scored.length * 100)}%` : ""} darkMode={darkMode} />
      <StatCard label="At Risk" value={r} color="#991b1b" sub={scored.length ? `${Math.round(r / scored.length * 100)}%` : ""} darkMode={darkMode} />
      <StatCard label="Unscored" value={filtered.length - scored.length} color="#6b7280" darkMode={darkMode} />
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <input className={`border rounded-lg px-3 py-1.5 text-sm w-full sm:flex-1 sm:min-w-48 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-400" : "border-gray-200 bg-white"}`} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
        <Sel label="Tier" value={fT} onChange={setFT} options={["All", ...TIERS]} darkMode={darkMode} />
        {canViewAllAdvisors(user) && <Sel label="Advisor" value={fA} onChange={setFA} options={["All", ...ADVISORS]} darkMode={darkMode} />}
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
                <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{c.leadAdvisor}</span>
                <span className={`text-xs font-medium ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{fmtM(c.monthlyFee)}/mo</span>
              </div>
            </div>
            <ScoreCircle score={c.latestScore} size={42} />
          </div>
          <div className="flex items-center justify-between">
            <Badge status={c.status} sm />
            <div className="flex items-center gap-2">
              {c.anniversaryDays != null && c.anniversaryDays <= 30 && <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">🎂 {c.anniversaryDays}d</span>}
              <TrendArrow cur={c.latestScore} prev={c.prevScore} />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

// ===== RANKING =====
function RankingTab({ clients, scores, onSelect, darkMode }: { clients: Client[]; scores: Score[]; onSelect: (id: string) => void; darkMode?: boolean }) {
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
        <button onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")} className={`border rounded-lg px-3 py-1.5 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 hover:bg-slate-600" : "border-gray-200 bg-white hover:bg-gray-50"}`}>{sortDir === "asc" ? "↑ Worst" : "↓ Best"}</button>
      </div>
    </div>
    {ranked.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No scored clients.</p> :
      <div className="space-y-1">{ranked.map((c, i) => {
        const col = sColor(getStatus(c.avgScore)); const pct = ((c.avgScore || 0) / 10) * 100;
        return <div key={c.id} className={`flex items-center gap-2 group cursor-pointer rounded-lg px-1 py-1 ${darkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"}`} onClick={() => onSelect(c.id)}>
          <div className={`w-5 text-xs text-right font-mono shrink-0 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{i + 1}</div>
          <div className={`w-36 shrink-0 truncate text-sm font-medium group-hover:text-blue-600 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</div>
          <div className="flex-1 relative h-5"><div className={`absolute inset-0 rounded ${darkMode ? "bg-slate-700" : "bg-gray-50"}`} /><div className="absolute top-1 bottom-1 rounded-r-md" style={{ width: `${pct}%`, background: col.bd, minWidth: 4 }} /></div>
          <span className="w-10 text-right text-sm font-bold shrink-0" style={{ color: col.tx }}>{(c.avgScore || 0).toFixed(1)}</span>
          <div className="w-16 shrink-0"><Badge status={getStatus(c.avgScore)} sm /></div>
        </div>;
      })}</div>}
  </div>;
}

// ===== ADVISORS =====
function AdvisorTab({ stats, darkMode }: { stats: ClientStat[]; darkMode?: boolean }) {
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
        <div className="flex items-center justify-between mb-4"><h3 className={`text-lg font-bold ${darkMode ? "text-gray-100" : ""}`} style={{ color: darkMode ? undefined : "#1B2A4A" }}>{a.adv}</h3><ScoreCircle score={a.avg} size={52} /></div>
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

// ===== COMPLIANCE =====
function ComplianceTab({ stats, onSelect, darkMode }: { stats: ClientStat[]; onSelect: (id: string) => void; darkMode?: boolean }) {
  const nowMs = Date.now();
  const cc: Record<string, { bg: string; tx: string }> = { OVERDUE: { bg: "#fecaca", tx: "#991b1b" }, NEVER: { bg: "#e5e7eb", tx: "#374151" }, "DUE SOON": { bg: "#fef9c3", tx: "#854d0e" }, "ON TRACK": { bg: "#dcfce7", tx: "#166534" } };
  const items = useMemo(() => stats.map(c => {
    const cadence = CADENCE_DAYS[c.tier] || 30; const lastTs = c.lastScoredTs ? new Date(c.lastScoredTs).getTime() : null;
    const daysSince = lastTs ? Math.floor((nowMs - lastTs) / 86400000) : 999;
    const compStatus = daysSince === 999 ? "NEVER" : daysSince > cadence ? "OVERDUE" : daysSince > cadence - 7 ? "DUE SOON" : "ON TRACK";
    return { ...c, cadence, daysSince, compStatus };
  }).sort((a, b) => b.daysSince - a.daysSince), [stats, nowMs]);

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
          return <div key={c.id} className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer ${darkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"}`} onClick={() => onSelect(c.id)}>
            <div className={`w-40 truncate text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{c.name}</div>
            <span className={`text-xs px-2 py-0.5 rounded w-20 text-center ${darkMode ? "bg-slate-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{c.tier}</span>
            <span className={`text-xs w-14 text-center ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{c.leadAdvisor}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold w-20 text-center" style={{ background: co.bg, color: co.tx }}>{c.compStatus}</span>
            <span className={`text-xs w-20 text-center ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.daysSince === 999 ? "Never" : `${c.daysSince}d ago`}</span>
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
      <h3 className="text-sm font-bold text-purple-700 mb-2">🎂 UPCOMING ANNIVERSARIES ({upcoming.length})</h3>
      <p className="text-xs text-purple-500 mb-3">Client onboarding anniversaries within 30 days — trigger a wow moment!</p>
      {upcoming.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer border-b border-purple-100 last:border-0 ${darkMode ? "hover:bg-purple-900/20" : "hover:bg-purple-50"}`} onClick={() => onSelect(c.id)}>
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-lg">🎂</div>
          <div className="flex-1 min-w-0"><div className={`text-sm font-semibold truncate ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier} · {c.leadAdvisor} · {fmtM(c.monthlyFee)}/mo</div></div>
          <div className="text-right shrink-0"><div className="text-sm font-bold text-purple-700">{c.anniversaryDays === 0 ? "TODAY!" : `In ${c.anniversaryDays} days`}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{c.nextAnniversary}</div></div>
        </div>
      ))}
    </div>}

    {atRisk.length > 0 && <div className={`rounded-xl border-2 border-red-300 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-red-700 mb-3">🚨 AT RISK ({atRisk.length})</h3>
      {atRisk.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer border-b border-red-100 last:border-0 ${darkMode ? "hover:bg-red-900/20" : "hover:bg-red-50"}`} onClick={() => onSelect(c.id)}>
          <ScoreCircle score={c.latestScore} size={36} />
          <div className="flex-1 min-w-0"><div className={`text-sm font-semibold truncate ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.tier} · {fmtM(c.monthlyFee)}/mo</div></div>
          <div className="text-sm font-bold text-red-700">{fmtM(c.monthlyFee * 12)}/yr</div>
        </div>
      ))}
    </div>}

    {dropped.length > 0 && <div className={`rounded-xl border-2 border-amber-300 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-amber-700 mb-3">⚠️ STATUS DROPPED ({dropped.length})</h3>
      {dropped.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 cursor-pointer rounded-lg ${darkMode ? "hover:bg-amber-900/20" : "hover:bg-amber-50"}`} onClick={() => onSelect(c.id)}>
          <ScoreCircle score={c.latestScore} size={36} />
          <div className="flex-1"><div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div></div>
          <Badge status={c.prevStatus} sm /><span className={darkMode ? "text-gray-500" : "text-gray-400"}>→</span><Badge status={c.status} sm />
        </div>
      ))}
    </div>}

    {watchList.length > 0 && <div className={`rounded-xl border border-amber-200 p-5 ${darkMode ? "bg-slate-800" : "bg-white"}`}>
      <h3 className="text-sm font-bold text-amber-700 mb-3">👀 WATCH LIST ({watchList.length})</h3>
      {watchList.map(c => (
        <div key={c.id} className={`flex items-center gap-3 py-2 cursor-pointer rounded-lg ${darkMode ? "hover:bg-amber-900/20" : "hover:bg-amber-50"}`} onClick={() => onSelect(c.id)}>
          <ScoreCircle score={c.latestScore} size={36} />
          <div className="flex-1"><div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : ""}`}>{c.name}</div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{fmtM(c.monthlyFee)}/mo</div></div>
          <TrendArrow cur={c.latestScore} prev={c.prevScore} />
        </div>
      ))}
    </div>}

    {atRisk.length + dropped.length + watchList.length + upcoming.length === 0 && <div className={`rounded-xl border border-green-200 p-8 text-center ${darkMode ? "bg-slate-800" : "bg-white"}`}><p className="text-green-700 font-semibold">✅ Portfolio healthy — no alerts!</p></div>}
  </div>;
}

// ===== REVENUE =====
function RevenueTab({ stats, darkMode }: { stats: ClientStat[]; darkMode?: boolean }) {
  const totalRev = stats.reduce((s, c) => s + c.monthlyFee, 0);
  const byStatus = ["HEALTHY", "WATCH", "AT RISK", null].map(st => {
    const cs = stats.filter(c => c.status === st); const rev = cs.reduce((s, c) => s + c.monthlyFee, 0);
    return { status: st || "UNSCORED", count: cs.length, rev, pct: totalRev ? rev / totalRev * 100 : 0 };
  });
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Monthly" value={fmtM(totalRev)} color="#1B2A4A" sub={fmtM(totalRev * 12) + "/yr"} darkMode={darkMode} />
      <StatCard label="Healthy Rev" value={fmtM(byStatus[0].rev)} color="#166534" sub={`${Math.round(byStatus[0].pct)}%`} darkMode={darkMode} />
      <StatCard label="Watch Rev" value={fmtM(byStatus[1].rev)} color="#854d0e" sub={`${Math.round(byStatus[1].pct)}%`} darkMode={darkMode} />
      <StatCard label="At-Risk Rev" value={fmtM(byStatus[2].rev)} color="#991b1b" sub={`${Math.round(byStatus[2].pct)}%`} darkMode={darkMode} />
    </div>
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>REVENUE BY STATUS</h3>
      <div className="h-8 flex rounded-lg overflow-hidden mb-2">
        {byStatus.filter(s => s.pct > 0).map(s => {
          const c = sColor(s.status === "UNSCORED" ? null : s.status);
          return <div key={s.status} style={{ width: `${s.pct}%`, background: c.bd }} className="flex items-center justify-center">{s.pct > 10 && <span className="text-xs font-bold" style={{ color: c.tx }}>{Math.round(s.pct)}%</span>}</div>;
        })}
      </div>
    </div>
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>BY CLIENT</h3>
      {[...stats].sort((a, b) => b.monthlyFee - a.monthlyFee).map(c => (
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

// ===== REFERRALS (NEW) =====
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
          <div className="flex justify-between text-sm mb-1"><span className={`font-medium ${darkMode ? "text-gray-200" : ""}`}>{s.source}</span><span className={darkMode ? "text-gray-400" : "text-gray-500"}>{s.count} · {fmtM(s.rev)}/mo</span></div>
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
          <div className="flex-1 min-w-0"><div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{referrer?.name || "?"}</span> → <span className="font-semibold">{referred?.name || "Prospect"}</span></div><div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{r.date} · {r.notes}</div></div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stCls}`}>{r.status}</span>
          {r.revenueGenerated > 0 && <span className="text-sm font-bold text-green-700">{fmtM(r.revenueGenerated)}</span>}
        </div>;
      })}
    </div>
  </div>;
}

// ===== ACTIVITY =====
function ActivityTab({ clients, scores, wows, darkMode }: { clients: Client[]; scores: Score[]; wows: Wow[]; darkMode?: boolean }) {
  const events = useMemo(() => {
    const items: Array<{ type: string; ts: string; client: string; assessor?: string; score?: number | null; status?: string | null; month?: string; notes?: string; owner?: string; description?: string; wowType?: string }> = [];
    (scores || []).forEach(s => { const c = (clients || []).find(x => x.id === s.clientId); items.push({ type: "score", ts: s.ts || `${s.year}-01-15T12:00:00Z`, client: c?.name || "?", assessor: s.assessor, score: calcScore(s.scores), status: getStatus(calcScore(s.scores)), month: `${MO[s.month]} ${s.year}`, notes: s.notes }); });
    (wows || []).forEach(w => { const c = (clients || []).find(x => x.id === w.clientId); items.push({ type: "wow", ts: w.date + "T12:00:00Z", client: c?.name || "?", owner: w.owner, description: w.description, wowType: w.type }); });
    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [clients, scores, wows]);

  return <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
    <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>ACTIVITY FEED</h3>
    <div className="space-y-3">
      {events.map((e, i) => (
        <div key={i} className={`flex gap-3 p-3 rounded-lg border ${
          e.type === "wow"
            ? (darkMode ? "border-amber-900 bg-amber-950" : "border-amber-100 bg-amber-50")
            : e.status === "AT RISK"
            ? (darkMode ? "border-red-900 bg-red-950" : "border-red-100 bg-red-50")
            : (darkMode ? "border-slate-600 bg-slate-700" : "border-gray-100")
        }`}>
          <div className="shrink-0">{e.type === "score" ? <ScoreCircle score={e.score ?? null} size={32} /> : <div className={`w-8 h-8 rounded-full ${darkMode ? "bg-amber-700" : "bg-amber-200"} flex items-center justify-center`}>⭐</div>}</div>
          <div className="flex-1 min-w-0">
            {e.type === "score" ? <>
              <div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{e.assessor}</span> scored <span className="font-semibold">{e.client}</span> — {e.month}</div>
              <div className="flex items-center gap-2 mt-1"><span className={`text-sm font-bold ${darkMode ? "text-white" : ""}`} style={{ color: darkMode ? "#ffffff" : sColor(e.status ?? null).tx }}>{e.score?.toFixed(1)}</span><Badge status={e.status ?? null} sm /></div>
              {e.notes && <p className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{e.notes}</p>}
            </> : <>
              <div className={`text-sm ${darkMode ? "text-gray-200" : ""}`}><span className="font-semibold">{e.owner}</span> wow → <span className="font-semibold">{e.client}</span></div>
              <p className={`text-xs mt-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{e.description}</p>
            </>}
          </div>
          <div className={`text-[10px] shrink-0 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{timeAgo(e.ts)}</div>
        </div>
      ))}
      {events.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>}
    </div>
  </div>;
}

// ===== SETTINGS =====
function SettingsTab({ settings, onSave, onSync, onImport, darkMode }: { settings: Settings; onSave: (s: Settings) => void; onSync: () => void; onImport: () => Promise<number>; darkMode?: boolean }) {
  const [sources, setSources] = useState<string[]>(settings.referralSources || REFERRAL_SOURCES);
  const [newSource, setNewSource] = useState("");
  const [wbEnabled, setWbEnabled] = useState(settings.wealthboxEnabled || false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [importStatus, setImportStatus] = useState<string>("");
  const [testStatus, setTestStatus] = useState<string>("");

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
    onSave({ ...settings, referralSources: sources, wealthboxEnabled: wbEnabled });
  };

  const handleTestConnection = async () => {
    setTestStatus("Testing...");
    try {
      const result = await testWealthboxConnection();
      if (result.success) {
        setTestStatus(`✓ Connected! Found ${result.count} contacts`);
      } else {
        setTestStatus(`✗ Failed: ${result.message}`);
      }
    } catch (error) {
      setTestStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus("Syncing...");
    try {
      await onSync();
      const now = new Date().toLocaleString();
      setSyncStatus(`✓ Synced at ${now}`);
      onSave({ ...settings, lastWealthboxSync: now });
    } catch (error) {
      setSyncStatus(`✗ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportStatus("Importing...");
    try {
      const count = await onImport();
      if (count > 0) {
        setImportStatus(`✓ Imported ${count} new client${count === 1 ? '' : 's'}!`);
      } else {
        setImportStatus(`✓ No new clients to import`);
      }
    } catch (error) {
      setImportStatus(`✗ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
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

      {/* Wealthbox Integration */}
      <div>
        <h4 className={`text-base font-semibold mb-2 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>🔗 Wealthbox Integration</h4>
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
                  onClick={handleImport}
                  disabled={importing}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium ${importing ? "opacity-50 cursor-not-allowed" : ""} ${darkMode ? "bg-slate-600 text-gray-200 hover:bg-slate-500" : "bg-white text-gray-700 hover:bg-gray-50"} border ${darkMode ? "border-slate-500" : "border-gray-300"}`}
                >
                  {importing ? "Importing..." : "📥 Import New Clients Only"}
                </button>
                <p className={`text-[11px] mt-1.5 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  One-time import of new Wealthbox contacts not already in the app. Existing clients are not affected.
                </p>
              </div>

              {testStatus && (
                <div className={`text-xs p-2 rounded ${testStatus.startsWith("✓") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {testStatus}
                </div>
              )}

              {syncStatus && (
                <div className={`text-xs p-2 rounded ${syncStatus.startsWith("✓") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {syncStatus}
                </div>
              )}

              {importStatus && (
                <div className={`text-xs p-2 rounded ${importStatus.startsWith("✓") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
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

      {/* Save Button */}
      <div className="flex gap-2 pt-4 border-t border-gray-200">
        <button onClick={handleSave} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Save Settings</button>
        <button onClick={() => { setSources(settings.referralSources || REFERRAL_SOURCES); setWbEnabled(settings.wealthboxEnabled || false); }} className={`border px-4 py-2 rounded-lg text-sm ${darkMode ? "border-slate-600 text-gray-300 hover:bg-slate-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Reset</button>
      </div>
    </div>
  </div>;
}

// ===== CLIENT DETAIL =====
function ClientDetail({ client, scores, wows, referrals, onBack, onScore, onAddWow, onEditClient, onExportPDF, user, darkMode }: {
  client: ClientStat; scores: Score[]; wows: Wow[]; referrals: Referral[];
  onBack: () => void; onScore: () => void; onAddWow: () => void; onEditClient: () => void; onExportPDF: () => void; user?: UserProfile; darkMode?: boolean;
}) {
  const cs = (scores || []).filter(s => s.clientId === client.id).sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  const latest = cs.length > 0 ? cs[cs.length - 1] : null;
  const prev = cs.length > 1 ? cs[cs.length - 2] : null;
  const ls = latest ? calcScore(latest.scores) : null;
  const ps = prev ? calcScore(prev.scores) : null;
  const st = getStatus(ls);
  const cw = (wows || []).filter(w => w.clientId === client.id);
  const cr = (referrals || []).filter(r => r.referrerId === client.id);
  const trend = cs.map(s => ({ label: `${MO[s.month]} ${s.year}`, score: calcScore(s.scores) || 0 }));
  const cH = 120;

  return <div className="space-y-4 sm:space-y-5">
    <button onClick={onBack} className="text-sm text-blue-600 hover:text-blue-800">← Back</button>
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
          {client.anniversaryDays != null && client.anniversaryDays <= 60 && <div className={`text-xs mt-1 ${darkMode ? "text-purple-400" : "text-purple-600"}`}>🎂 Anniversary: {client.nextAnniversary} ({client.anniversaryDays === 0 ? "TODAY!" : `in ${client.anniversaryDays} days`})</div>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3"><ScoreCircle score={ls} size={48} /><div><Badge status={st} /><div className="flex items-center gap-1 mt-1"><TrendArrow cur={ls} prev={ps} /><span className="text-xs text-gray-400 hidden sm:inline">vs prior</span></div></div></div>
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        {canScore(user) && <button onClick={onScore} className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700">Score This Month</button>}
        {canScore(user) && <button onClick={onAddWow} className="bg-amber-500 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-600">+ Wow</button>}
        {canEdit(user) && <button onClick={onEditClient} className="border border-gray-200 text-gray-600 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm hover:bg-gray-50">Edit</button>}
        {canExport(user) && <button onClick={onExportPDF} className="border border-blue-200 text-blue-600 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm hover:bg-blue-50 font-medium">📄 Export PDF</button>}
      </div>
    </div>

    {latest && <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h3 className={`text-sm font-semibold mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>DIMENSION BREAKDOWN</h3>
      {DIMENSIONS.map(dim => {
        const avg = dimAvg(latest.scores, dim);
        return <div key={dim} className="mb-3">
          <div className="flex justify-between mb-1"><span className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{dim} ({DIM_WEIGHTS[dim] * 100}%)</span><span className="text-sm font-semibold" style={{ color: sColor(getStatus(avg)).tx }}>{avg != null ? avg.toFixed(1) : "—"}</span></div>
          <div className="grid grid-cols-1 gap-1 ml-3 sm:grid-cols-2 lg:grid-cols-3">{METRICS.filter(m => m.dim === dim).map(m => <div key={m.id} className="flex items-center gap-2"><span className={`text-xs w-28 truncate ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{m.name} ({m.weight * 100}%)</span><MiniBar value={latest.scores[m.id]} /></div>)}</div>
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
      {[...cs].reverse().map((s, i) => { const score = calcScore(s.scores); const sst = getStatus(score); return <div key={i} className={`border rounded-lg p-3 mb-2 ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
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
      {cw.map(w => <div key={w.id} className="border border-amber-100 bg-amber-50 rounded-lg p-3 mb-2"><div className="flex items-center gap-2 mb-1"><span className="text-xs px-2 py-0.5 rounded bg-amber-200 text-amber-800 font-medium">{w.type}</span><span className="text-xs text-gray-400">{w.date} · {w.owner}</span></div><p className="text-sm text-gray-800">{w.description}</p>{w.reaction && <p className="text-xs text-amber-700 italic mt-1">↪ {w.reaction}</p>}</div>)}
      {cw.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No wow moments.</p>}
    </div>
  </div>;
}

// ===== SCORING FORM =====
function ScoringForm({ client, existingScore, onSave, onCancel, darkMode }: { client: Client; existingScore?: Score; onSave: (s: Score) => void; onCancel: () => void; darkMode?: boolean }) {
  const now = new Date();
  const [month, setMonth] = useState(existingScore?.month ?? now.getMonth());
  const [year, setYear] = useState(existingScore?.year ?? now.getFullYear());
  const [scoreVals, setScoreVals] = useState(existingScore?.scores ?? Array(14).fill(5));
  const [assessor, setAssessor] = useState(existingScore?.assessor ?? "");
  const [notes, setNotes] = useState(existingScore?.notes ?? "");
  const [actions, setActions] = useState(existingScore?.actionItems ?? "");
  const weighted = calcScore(scoreVals); const status = getStatus(weighted);
  const upd = (i: number, v: string) => { const n = [...scoreVals]; n[i] = Math.max(1, Math.min(10, Number(v) || 5)); setScoreVals(n); };

  return <div className="space-y-4 sm:space-y-5">
    <button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">← Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h2 className={`text-base sm:text-lg font-bold mb-1 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Score: {client.name}</h2>
      <div className="flex gap-3 mb-4 flex-wrap">
        <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Month</label><select className={`block border rounded px-2 py-1 text-sm mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={month} onChange={e => setMonth(Number(e.target.value))}>{MO.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Year</label><input type="number" className={`block border rounded px-2 py-1 text-sm w-20 mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={year} onChange={e => setYear(Number(e.target.value))} /></div>
        <div><label className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Assessor</label><select className={`block border rounded px-2 py-1 text-sm mt-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={assessor} onChange={e => setAssessor(e.target.value)}><option value="">Select...</option>{ADVISORS.map(a => <option key={a}>{a}</option>)}</select></div>
      </div>
      <div className="flex items-center gap-4 p-3 rounded-lg mb-4" style={{ background: sColor(status).bg, border: `1px solid ${sColor(status).bd}` }}><ScoreCircle score={weighted} size={52} /><div><div className="text-sm font-semibold" style={{ color: sColor(status).tx }}>{status || "Score all metrics"}</div><div className="text-xs text-gray-500">Weighted: {weighted?.toFixed(2)}</div></div></div>
      {DIMENSIONS.map(dim => <div key={dim} className="mb-4"><h3 className={`text-sm font-semibold mb-2 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{dim} <span className={`font-normal text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>({(DIM_WEIGHTS[dim] * 100).toFixed(0)}%)</span></h3>
        {METRICS.filter(m => m.dim === dim).map(m => <div key={m.id} className="mb-3"><div className="flex items-center gap-2 mb-1"><div className={`w-40 text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{m.name} ({(m.weight * 100).toFixed(0)}%)</div><input type="range" min="1" max="10" value={scoreVals[m.id]} onChange={e => upd(m.id, e.target.value)} className="flex-1 h-2 accent-blue-600" /><input type="number" min="1" max="10" value={scoreVals[m.id]} onChange={e => upd(m.id, e.target.value)} className={`w-12 text-center border rounded text-sm py-0.5 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} /></div><div className={`text-[10px] ml-1 leading-tight ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{m.helper}</div></div>)}
      </div>)}
      <div className={`space-y-3 mt-4 pt-4 border-t ${darkMode ? "border-slate-700" : "border-gray-100"}`}>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Observations</label><textarea className={`w-full border rounded-lg p-2 text-sm h-20 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Action Items</label><textarea className={`w-full border rounded-lg p-2 text-sm h-16 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={actions} onChange={e => setActions(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ clientId: client.id, year, month, scores: scoreVals, assessor, notes, actionItems: actions, ts: new Date().toISOString() })} disabled={!assessor} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save</button>
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  </div>;
}

// ===== CLIENT FORM (with referral fields) =====
function ClientForm({ client, onSave, onCancel, referralSources, darkMode }: { client?: Client; onSave: (c: Client) => void; onCancel: () => void; referralSources?: string[]; darkMode?: boolean }) {
  const sources = referralSources || REFERRAL_SOURCES;
  const [name, setName] = useState(client?.name ?? "");
  const [tier, setTier] = useState(client?.tier ?? "FFO");
  const [adv, setAdv] = useState(client?.leadAdvisor ?? "Landon");
  const [date, setDate] = useState(client?.onboardDate ?? new Date().toISOString().slice(0, 10));
  const [mFee, setMFee] = useState(client?.monthlyFee ?? TIER_REVENUE.FFO);
  const [refSrc, setRefSrc] = useState(client?.referralSource ?? "");
  const [refBy, setRefBy] = useState(client?.referredBy ?? "");

  return <div className="space-y-5">
    <button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">← Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 max-w-lg ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
      <h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>{client ? "Edit Client" : "Add Client"}</h2>
      <div className="space-y-3">
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Name</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Tier</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={tier} onChange={e => { setTier(e.target.value); if (!client) setMFee(TIER_REVENUE[e.target.value] || 5000); }}>{TIERS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Advisor</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={adv} onChange={e => setAdv(e.target.value)}>{ADVISORS.map(a => <option key={a}>{a}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Onboard Date</label><input type="date" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Monthly Fee ($)</label><input type="number" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={mFee} onChange={e => setMFee(Number(e.target.value) || 0)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Referral Source</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={refSrc} onChange={e => setRefSrc(e.target.value)}><option value="">Select...</option>{sources.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Referred By</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200 placeholder-gray-500" : "border-gray-200 bg-white"}`} value={refBy} onChange={e => setRefBy(e.target.value)} placeholder="Client name or COI" /></div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ id: client?.id || ("c" + Date.now()), name, tier, leadAdvisor: adv, onboardDate: date, monthlyFee: mFee, referralSource: refSrc, referredBy: refBy })} disabled={!name.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save</button>
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  </div>;
}

// ===== WOW FORM =====
function WowForm({ clientId, onSave, onCancel, darkMode }: { clientId: string; onSave: (w: Wow) => void; onCancel: () => void; darkMode?: boolean }) {
  const [desc, setDesc] = useState(""); const [type, setType] = useState("Proactive"); const [owner, setOwner] = useState(""); const [reaction, setReaction] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return <div className="space-y-5"><button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">← Back</button>
    <div className={`rounded-xl border p-4 sm:p-5 max-w-lg ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}><h2 className={`text-lg font-bold mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>Log Wow Moment</h2>
      <div className="space-y-3">
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Description</label><textarea className={`w-full border rounded-lg px-3 py-2 text-sm h-20 ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={desc} onChange={e => setDesc(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-3"><div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Type</label><select className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={type} onChange={e => setType(e.target.value)}>{WOW_TYPES.map(t => <option key={t}>{t}</option>)}</select></div><div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Owner</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={owner} onChange={e => setOwner(e.target.value)} /></div><div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Date</label><input type="date" className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={date} onChange={e => setDate(e.target.value)} /></div></div>
        <div><label className={`text-xs block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Reaction</label><input className={`w-full border rounded-lg px-3 py-2 text-sm ${darkMode ? "bg-slate-700 border-slate-600 text-gray-200" : "border-gray-200 bg-white"}`} value={reaction} onChange={e => setReaction(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button onClick={() => onSave({ id: "w" + Date.now(), clientId, date, description: desc, type, owner, reaction })} disabled={!desc.trim() || !owner.trim()} className="bg-amber-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40">Save</button><button onClick={onCancel} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button></div>
    </div>
  </div>;
}

// ===== REFERRAL FORM (NEW) =====
function ReferralForm({ clients, onSave, onCancel, referralSources, darkMode }: { clients: Client[]; onSave: (r: Referral) => void; onCancel: () => void; referralSources?: string[]; darkMode?: boolean }) {
  const sources = referralSources || REFERRAL_SOURCES;
  const [referrerId, setReferrerId] = useState(""); const [referredId, setReferredId] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(sources[0]); const [status, setStatus] = useState("Prospect"); const [notes, setNotes] = useState(""); const [rev, setRev] = useState(0);
  return <div className="space-y-5"><button onClick={onCancel} className="text-sm text-blue-600 hover:text-blue-800">← Back</button>
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
      <div className="flex gap-2 mt-4"><button onClick={() => onSave({ id: "r" + Date.now(), referrerId, referredClientId: referredId, date, source, status, notes, revenueGenerated: rev })} disabled={!referrerId} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save</button><button onClick={onCancel} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button></div>
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

  useEffect(() => {
    loadData().then(d => { setData(d); setLoading(false); });
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
  const stats = useClientStats(visibleClients, data?.scores || []);
  const selected = data ? (data.clients || []).find(c => c.id === selectedId) : null;
  const selectedStat = stats.find(c => c.id === selectedId);
  const alertCount = stats.filter(c => c.status === "AT RISK").length + stats.filter(c => c.anniversaryDays != null && c.anniversaryDays <= 30).length;

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>;
  if (!data) return null;

  const go = (id: string) => { setSelectedId(id); setView("detail"); };
  const back = () => { setView("dashboard"); setSelectedId(null); };

  const handleSaveScore = async (s: Score) => {
    const idx = data.scores.findIndex(x => x.clientId === s.clientId && x.year === s.year && x.month === s.month);
    const ns = [...data.scores]; if (idx >= 0) ns[idx] = s; else ns.push(s);
    await persist({ ...data, scores: ns });

    // Push to Wealthbox if enabled and client has wealthboxId
    const client = data.clients.find(c => c.id === s.clientId);
    if (data.settings?.wealthboxEnabled && client?.wealthboxId) {
      const score = calcScore(s.scores);
      if (score !== null) {
        const status = getStatus(score) || "WATCH";
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
          // Don't block the save if Wealthbox push fails
        }
      }
    }

    setView("detail");
  };

  const handleSaveClient = async (c: Client) => {
    const idx = data.clients.findIndex(x => x.id === c.id);
    const nc = [...data.clients]; if (idx >= 0) nc[idx] = c; else nc.push(c);
    await persist({ ...data, clients: nc });
    if (view === "addClient") { setSelectedId(c.id); setView("detail"); } else setView("detail");
  };

  const handleSaveWow = async (w: Wow) => { await persist({ ...data, wows: [...(data.wows || []), w] }); setView("detail"); };
  const handleSaveRef = async (r: Referral) => { await persist({ ...data, referrals: [...(data.referrals || []), r] }); setView("dashboard"); setTab("referrals"); };

  const handleExportClientPDF = () => {
    if (!selectedStat) return;
    exportClientPDF(selectedStat, data.scores, data.wows, data.referrals || []);
  };

  const handleExportPortfolioPDF = () => { exportPortfolioPDF(stats, data.referrals || []); };

  const handleSaveSettings = async (settings: Settings) => {
    await persist({ ...data, settings });
  };

  const handleWealthboxSync = async () => {
    try {
      const wealthboxClients = await syncFromWealthbox();

      // Build a map of existing clients by wealthboxId
      const existingByWealthboxId = new Map(
        data.clients
          .filter(c => c.wealthboxId)
          .map(c => [c.wealthboxId!, c])
      );

      const updatedClients = data.clients.map(existingClient => {
        if (!existingClient.wealthboxId) return existingClient;

        // Find the matching Wealthbox client
        const wealthboxClient = wealthboxClients.find(wc => wc.wealthboxId === existingClient.wealthboxId);
        if (!wealthboxClient) return existingClient;

        // Update metadata fields but preserve the name (user may have edited it)
        return {
          ...existingClient,
          tier: wealthboxClient.tier,
          leadAdvisor: wealthboxClient.leadAdvisor,
          monthlyFee: wealthboxClient.monthlyFee,
          onboardDate: wealthboxClient.onboardDate,
          referralSource: wealthboxClient.referralSource,
          referredBy: wealthboxClient.referredBy,
          // name is intentionally NOT updated to preserve user edits
        };
      });

      // Add new clients that don't exist yet (by wealthboxId)
      const existingWealthboxIds = new Set(data.clients.map(c => c.wealthboxId).filter(Boolean));
      const newClients = wealthboxClients.filter(wc => !existingWealthboxIds.has(wc.wealthboxId));

      const mergedClients = [...updatedClients, ...newClients];
      await persist({ ...data, clients: mergedClients });
    } catch (error) {
      console.error('Wealthbox sync error:', error);
      throw error;
    }
  };

  const handleWealthboxImport = async (): Promise<number> => {
    try {
      const { newClients, count } = await importNewClientsFromWealthbox(data.clients);
      if (count > 0) {
        const mergedClients = [...data.clients, ...newClients];
        await persist({ ...data, clients: mergedClients });
      }
      return count;
    } catch (error) {
      console.error('Wealthbox import error:', error);
      throw error;
    }
  };

  const handleReset = async () => {
    await persist({ clients: DEFAULT_CLIENTS, scores: DEFAULT_SCORES, wows: DEFAULT_WOWS, referrals: DEFAULT_REFERRALS, settings: { referralSources: REFERRAL_SOURCES } });
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
            <span className={`text-xs hidden md:inline ${darkMode ? "text-white" : "text-gray-600"}`}>{visibleClients.length} clients · {fmtM(visibleClients.reduce((s, c) => s + getFee(c), 0))}/mo</span>
            {canExport(currentUser) && <button onClick={handleExportPortfolioPDF} className="text-xs text-blue-600 hover:text-blue-800 font-medium hidden md:inline">📄 Portfolio PDF</button>}
            <select className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 rounded-lg font-medium ${roleBg}`} value={currentUser.id} onChange={e => { const u = DEFAULT_USERS.find(x => x.id === e.target.value); if (u) setCurrentUser(u); setView("dashboard"); setSelectedId(null); }}>
              {DEFAULT_USERS.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            <button onClick={toggleDarkMode} className={`text-base sm:text-lg ${darkMode ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"}`} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? "☀️" : "🌙"}</button>
            <button onClick={handleReset} className={`text-xs hidden sm:inline ${darkMode ? "text-gray-400 hover:text-red-400" : "text-gray-400 hover:text-red-500"}`} title="Reset">↻</button>
          </div>
        </div>
      </div>
    </div>

    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
      {view === "dashboard" && <>
        <TabNav active={tab} onChange={setTab} alertCount={alertCount} />
        {tab === "overview" && <OverviewTab stats={stats} onSelect={go} onAdd={() => setView("addClient")} user={currentUser} darkMode={darkMode} />}
        {tab === "ranking" && <RankingTab clients={visibleClients} scores={data.scores || []} onSelect={go} darkMode={darkMode} />}
        {tab === "advisors" && <AdvisorTab stats={stats} darkMode={darkMode} />}
        {tab === "compliance" && <ComplianceTab stats={stats} onSelect={go} darkMode={darkMode} />}
        {tab === "alerts" && <AlertsTab stats={stats} onSelect={go} darkMode={darkMode} />}
        {tab === "revenue" && <RevenueTab stats={stats} darkMode={darkMode} />}
        {tab === "referrals" && <ReferralsTab stats={stats} referrals={data.referrals || []} onAddRef={() => setView("addRef")} referralSources={getReferralSources(data.settings)} darkMode={darkMode} />}
        {tab === "activity" && <ActivityTab clients={visibleClients} scores={data.scores || []} wows={data.wows || []} darkMode={darkMode} />}
        {tab === "settings" && <SettingsTab settings={data.settings || { referralSources: REFERRAL_SOURCES }} onSave={handleSaveSettings} onSync={handleWealthboxSync} onImport={handleWealthboxImport} darkMode={darkMode} />}
      </>}

      {view === "detail" && selectedStat && <ClientDetail client={selectedStat} scores={data.scores || []} wows={data.wows || []} referrals={data.referrals || []} onBack={back} onScore={() => setView("score")} onAddWow={() => setView("addWow")} onEditClient={() => setView("editClient")} onExportPDF={handleExportClientPDF} user={currentUser} darkMode={darkMode} />}
      {view === "score" && selected && <ScoringForm client={selected} existingScore={(data.scores || []).find(s => s.clientId === selectedId && s.year === new Date().getFullYear() && s.month === new Date().getMonth())} onSave={handleSaveScore} onCancel={() => setView("detail")} darkMode={darkMode} />}
      {view === "addClient" && <ClientForm onSave={handleSaveClient} onCancel={back} referralSources={getReferralSources(data.settings)} darkMode={darkMode} />}
      {view === "editClient" && selected && <ClientForm client={selected} onSave={handleSaveClient} onCancel={() => setView("detail")} referralSources={getReferralSources(data.settings)} darkMode={darkMode} />}
      {view === "addWow" && selected && <WowForm clientId={selectedId!} onSave={handleSaveWow} onCancel={() => setView("detail")} darkMode={darkMode} />}
      {view === "addRef" && <ReferralForm clients={data.clients} onSave={handleSaveRef} onCancel={() => { setView("dashboard"); setTab("referrals"); }} referralSources={getReferralSources(data.settings)} darkMode={darkMode} />}
    </div>
  </div>;
}

