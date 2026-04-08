// === CONSTANTS ===
export const STORAGE_KEY = "ffo-health-v7";
export const TIER_REVENUE: Record<string, number> = { FFO: 8000, "FFO Light": 4000, "FFO Access": 1500 };
export const CADENCE_DAYS: Record<string, number> = { FFO: 30, "FFO Light": 30, "FFO Access": 90 };
export const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const TIERS = ["FFO", "FFO Light", "FFO Access"];
export const ADVISORS = ["Landon", "Coty"];
export const WOW_TYPES = ["Explicit", "Secret", "Proactive", "Gift"];
export const REFERRAL_SOURCES = ["Client Referral", "COI Referral", "Advisor Network", "Event/Seminar", "Digital/Inbound", "Direct Outreach"];
export const NPS_SOURCES = ["Survey", "Call Notes"] as const;

// === TYPES ===
export interface Pod {
  id: string;
  name: string;
  advisors: string[];  // advisor names
  wpa?: string;        // wealth planner assistant name
}

export interface Client {
  id: string;
  wealthboxId?: string;
  name: string;
  tier: string;
  leadAdvisor: string;
  pod?: string;               // pod ID
  wpa?: string;               // primary wealth planner / WPA name
  onboardDate: string;
  monthlyFee: number;
  referralSource?: string;
  referredBy?: string;
  referralNotes?: string;
  birthDate?: string;
  completedTasks?: Array<{ name: string; completedAt: string; description?: string }>;
  baselineCompletedAt?: string; // timestamp when baseline scoring was completed
}

export interface Score {
  clientId: string;
  year: number;
  month: number;
  scores: number[];   // 16 elements (was 14, then 15 — migration handled)
  assessor: string;
  notes: string;
  actionItems: string;
  ts: string;
}

export interface NPSFeedback {
  id: string;
  clientId: string;
  npsScore: number;        // 0–10
  comment: string;
  source: string;          // "Survey" | "Call Notes"
  assessor: string;
  ts: string;
}

export interface Wow {
  id: string;
  clientId: string;
  date: string;
  description: string;
  type: string;
  owner: string;
  reaction: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredClientId: string;
  date: string;
  source: string;
  status: string;
  notes: string;
  revenueGenerated: number;
}

export interface ScoringConfig {
  atRiskThreshold: number;   // default 5
  watchThreshold: number;    // default 7
  dimensionWeights: Record<string, number>;  // overrides DIM_WEIGHTS
}

export interface Settings {
  referralSources: string[];
  wealthboxEnabled?: boolean;
  lastWealthboxSync?: string;
  pods?: Pod[];
  scoringConfig?: ScoringConfig;
}

export interface AppData {
  clients: Client[];
  scores: Score[];
  wows: Wow[];
  referrals: Referral[];
  npsFeedback?: NPSFeedback[];
  settings?: Settings;
  currentUser?: UserProfile;
}

export interface UserProfile {
  id: string;
  name: string;
  role: "admin" | "advisor" | "wp" | "wpa" | "viewer";
  advisorName?: string;
  podIds?: string[];
}

export interface ClientStat extends Client {
  latestScore: number | null;
  prevScore: number | null;
  status: string | null;
  prevStatus: string | null;
  latest: Score | null;
  dims: { name: string; avg: number | null }[];
  scoreCount: number;
  lastScoredTs: string | null;
  dropped: boolean;
  anniversaryDays: number | null;
  nextAnniversary: string | null;
  latestNPS: number | null;
}

export interface ExecSummary {
  clientId: string;
  achievementsSinceLastCheckin: Array<{ name: string; completedAt: string; description?: string }>;
  currentPriorities: Array<{ name: string; dueDate?: string; description?: string }>;
  outstandingItems: Array<{ name: string; dueDate?: string; description?: string }>;
  lastCheckinDate: string | null;
  generatedAt: string;
}

// === SCORING ENGINE ===
// 16 metrics across 6 dimensions
export const METRICS = [
  { id: 0, name: "Meeting Attendance", dim: "Engagement", weight: 0.10, helper: "1-3: Chronic no-shows (>40%) | 4-5: Frequently misses (20-40%) | 6-7: Occasionally misses (10-20%) | 8-9: Rarely misses (<10%) | 10: Never misses" },
  { id: 1, name: "Response / Resolution Time", dim: "Engagement", weight: 0.08, helper: "1-3: >7 days or no response | 4-5: 3-7 days | 6-7: 48-72hrs | 8-9: 24-48hrs | 10: <24hrs" },
  { id: 2, name: "Communication Quality", dim: "Engagement", weight: 0.07, helper: "1-3: Non-responsive/unclear | 4-5: Often incomplete | 6-7: Needs follow-up sometimes | 8-9: Complete when asked | 10: Proactive, detailed" },
  { id: 3, name: "Project Velocity", dim: "Progress", weight: 0.10, helper: "1-3: Stalled/blocked | 4-5: Significant delays (2-4 weeks) | 6-7: Minor delays (<2 weeks) | 8-9: On track | 10: Ahead of schedule" },
  { id: 4, name: "Milestone Achievement", dim: "Progress", weight: 0.13, helper: "1-3: <50% | 4-5: 50-74% | 6-7: 75-89% | 8-9: 90%+ | 10: 100% milestones hit" },
  { id: 5, name: "Direct Feedback", dim: "Satisfaction", weight: 0.07, helper: "1-3: Complaints/dissatisfaction | 4-5: Some concerns | 6-7: Neutral | 8-9: Positive when asked | 10: Unsolicited praise" },
  { id: 6, name: "NPS Score", dim: "Satisfaction", weight: 0.06, helper: "4-6: Detractor (0-6) | 7-8: Passive (7-8) | 10: Promoter (9-10) | N/A if not surveyed - use proxy" },
  { id: 7, name: "Complaint Frequency", dim: "Satisfaction", weight: 0.05, helper: "1-3: Major unresolved complaints | 4-5: Recurring issues | 6-7: 2-3 issues resolved | 8-9: 1 minor issue | 10: Zero complaints" },
  { id: 8, name: "Strategy Implementation", dim: "Financial Health", weight: 0.06, helper: "1-3: <40% or refusing | 4-5: 40-59% | 6-7: 60-79% | 8-9: 80%+ implemented | 10: All strategies implemented" },
  { id: 9, name: "Results Achieved", dim: "Financial Health", weight: 0.05, helper: "1-3: No measurable results | 4-5: Below expectations | 6-7: Partial results | 8-9: Meeting projections | 10: Exceeding projections" },
  { id: 10, name: "Payment Status", dim: "Financial Health", weight: 0.03, helper: "1-3: >30 days or disputes | 4-5: 15-30 day delays | 6-7: 8-14 day delays | 8-9: Occasional 1-7 day delay | 10: Always on time" },
  { id: 11, name: "Trust Level", dim: "Relationship", weight: 0.06, helper: "1-3: Distrustful/adversarial | 4-5: Withholds info | 6-7: Somewhat guarded | 8-9: Very open | 10: Full transparency, trusts completely" },
  { id: 12, name: "Partnership Quality", dim: "Relationship", weight: 0.05, helper: "1-3: Hostile/disrespectful | 4-5: Demanding/difficult | 6-7: Transactional | 8-9: Generally collaborative | 10: True partner, collaborative" },
  { id: 13, name: "Referral Willingness", dim: "Referral Awareness", weight: 0.04, helper: "1-3: Would not refer | 4-5: Unlikely to refer | 6-7: Might refer | 8-9: Would refer if asked | 10: Has referred or actively offers" },
  { id: 14, name: "Referral Activity", dim: "Referral Awareness", weight: 0.03, helper: "1-3: No referrals ever | 4-5: Mentioned once | 6-7: 1 referral in past year | 8-9: 2-3 referrals | 10: Active, ongoing referral source" },
  { id: 15, name: "Network Advocacy", dim: "Referral Awareness", weight: 0.02, helper: "1-3: Would not recommend publicly | 4-5: Neutral | 6-7: Positive if asked | 8-9: Mentions to peers | 10: Champions your brand publicly" },
];

export const METRIC_COUNT = 16;

export const DIMENSIONS = ["Engagement", "Progress", "Satisfaction", "Financial Health", "Relationship", "Referral Awareness"];
export const DIM_WEIGHTS: Record<string, number> = { Engagement: 0.25, Progress: 0.23, Satisfaction: 0.18, "Financial Health": 0.14, Relationship: 0.11, "Referral Awareness": 0.09 };

export function getEffectiveWeights(settings?: Settings): Record<string, number> {
  if (settings?.scoringConfig?.dimensionWeights) {
    return { ...DIM_WEIGHTS, ...settings.scoringConfig.dimensionWeights };
  }
  return DIM_WEIGHTS;
}

export function getThresholds(settings?: Settings): { atRisk: number; watch: number } {
  return {
    atRisk: settings?.scoringConfig?.atRiskThreshold ?? 5,
    watch: settings?.scoringConfig?.watchThreshold ?? 7,
  };
}

export function calcScore(arr: number[]): number | null {
  if (!arr || arr.length !== METRIC_COUNT) return null;
  return arr.reduce((sum, val, i) => sum + val * METRICS[i].weight, 0);
}

export function dimAvg(arr: number[], dim: string): number | null {
  const ms = METRICS.filter(m => m.dim === dim);
  const vals = ms.map(m => arr[m.id]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function getStatus(score: number | null, settings?: Settings): string | null {
  if (score == null) return null;
  const { atRisk, watch } = getThresholds(settings);
  return score >= watch ? "HEALTHY" : score >= atRisk ? "WATCH" : "AT RISK";
}

export function sColor(st: string | null) {
  if (st === "HEALTHY") return { bg: "#dcfce7", tx: "#166534", bd: "#86efac" };
  if (st === "WATCH") return { bg: "#fef9c3", tx: "#854d0e", bd: "#fde047" };
  if (st === "AT RISK") return { bg: "#fecaca", tx: "#991b1b", bd: "#fca5a5" };
  return { bg: "#f3f4f6", tx: "#6b7280", bd: "#d1d5db" };
}

export function getReferralSources(settings?: Settings): string[] {
  return settings?.referralSources || REFERRAL_SOURCES;
}

export function getFee(client: Partial<Client> | null): number {
  return Number(client?.monthlyFee) || 0;
}

export function fmtM(n: number | null | undefined): string {
  const num = Number(n) || 0;
  if (num >= 1000) return "$" + (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + "K";
  return "$" + num;
}

export function timeAgo(ts: string | null): string {
  if (!ts) return "";
  const sec = (Date.now() - new Date(ts).getTime()) / 1000;
  if (sec < 0) return "just now";
  if (sec < 3600) return Math.floor(sec / 60) + "m ago";
  if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
  return Math.floor(sec / 86400) + "d ago";
}

export function getNextAnniversary(onboardDate: string): { days: number; date: string } | null {
  if (!onboardDate) return null;
  const now = new Date();
  const obd = new Date(onboardDate);
  if (isNaN(obd.getTime())) return null;
  let anniv = new Date(now.getFullYear(), obd.getMonth(), obd.getDate());
  if (anniv < now) {
    anniv = new Date(now.getFullYear() + 1, obd.getMonth(), obd.getDate());
  }
  const days = Math.ceil((anniv.getTime() - now.getTime()) / 86400000);
  const dateStr = MO[anniv.getMonth()] + " " + anniv.getDate() + ", " + anniv.getFullYear();
  return { days, date: dateStr };
}

// === NPS HELPERS ===
export function npsCategory(score: number): string {
  if (score >= 9) return "Promoter";
  if (score >= 7) return "Passive";
  return "Detractor";
}

export function npsColor(score: number): string {
  if (score >= 9) return "#166534";
  if (score >= 7) return "#854d0e";
  return "#991b1b";
}

export function latestNPSForClient(feedback: NPSFeedback[], clientId: string): number | null {
  const sorted = feedback.filter(f => f.clientId === clientId).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return sorted.length ? sorted[0].npsScore : null;
}

// === POD HELPERS ===
export function getPods(settings?: Settings): Pod[] {
  return settings?.pods || DEFAULT_PODS;
}

export function getPodForClient(client: Client, settings?: Settings): Pod | null {
  const pods = getPods(settings);
  if (client.pod) return pods.find(p => p.id === client.pod) || null;
  return pods.find(p => p.advisors.includes(client.leadAdvisor)) || null;
}

// === PERMISSIONS ===
export function canScore(user: UserProfile | undefined): boolean {
  return !user || user.role === "admin" || user.role === "advisor" || user.role === "wp" || user.role === "wpa";
}

export function canEdit(user: UserProfile | undefined): boolean {
  return !user || user.role === "admin";
}

export function canExport(user: UserProfile | undefined): boolean {
  return !user || user.role === "admin" || user.role === "advisor";
}

export function canViewAllAdvisors(user: UserProfile | undefined): boolean {
  return !user || user.role === "admin" || user.role === "viewer";
}

export function canConfigureScoring(user: UserProfile | undefined): boolean {
  return !user || user.role === "admin";
}

export function filterByAdvisor(clients: Client[], user: UserProfile | undefined): Client[] {
  if (!user || user.role === "admin" || user.role === "viewer") return clients;
  if ((user.role === "advisor" || user.role === "wp" || user.role === "wpa") && user.advisorName) {
    return clients.filter(c => c.leadAdvisor === user.advisorName || c.wpa === user.advisorName);
  }
  return clients;
}

// === CSV IMPORT ===
export function parseCSVClients(csvText: string): Client[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  const clients: Client[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ""; });

    const name = row.name || row.client_name || row.first_name
      ? `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.name || row.client_name || ""
      : "";
    if (!name) continue;

    clients.push({
      id: "csv-" + Date.now() + "-" + i,
      name,
      tier: row.tier || row.client_tier || "FFO",
      leadAdvisor: row.lead_advisor || row.advisor || ADVISORS[0],
      pod: row.pod || row.pod_id || "",
      wpa: row.wpa || row.wealth_planner || "",
      onboardDate: row.onboard_date || row.client_since || new Date().toISOString().slice(0, 10),
      monthlyFee: Number(row.monthly_fee || row.fee) || 0,
      referralSource: row.referral_source || "",
      referredBy: row.referred_by || "",
    });
  }
  return clients;
}

// === DEFAULT DATA ===
export const DEFAULT_PODS: Pod[] = [
  { id: "pod1", name: "Pod Alpha", advisors: ["Landon"], wpa: "Thea" },
  { id: "pod2", name: "Pod Beta", advisors: ["Coty"], wpa: "Vinny" },
];

export const DEFAULT_USERS: UserProfile[] = [
  { id: "u1", name: "Landon (Admin)", role: "admin" },
  { id: "u2", name: "Coty (Advisor)", role: "advisor", advisorName: "Coty" },
  { id: "u3", name: "Thea (WPA)", role: "wpa", advisorName: "Thea" },
  { id: "u4", name: "Vinny (Viewer)", role: "viewer" },
];

export const DEFAULT_CLIENTS: Client[] = [
  { id: "c1", name: "Justin Saunders", tier: "FFO Access", leadAdvisor: "Coty", pod: "pod2", wpa: "Vinny", onboardDate: "2024-08-05", monthlyFee: 1500, referralSource: "Advisor Network" },
  { id: "c2", name: "Steve Wahl", tier: "FFO", leadAdvisor: "Landon", pod: "pod1", wpa: "Thea", onboardDate: "2025-06-01", monthlyFee: 10000, referralSource: "COI Referral", referredBy: "James Patterson, CPA" },
  { id: "c3", name: "Zac Saffron", tier: "FFO Light", leadAdvisor: "Coty", pod: "pod2", wpa: "Vinny", onboardDate: "2025-09-10", monthlyFee: 3800, referralSource: "Event/Seminar" },
  { id: "c4", name: "Victoria Duke", tier: "FFO", leadAdvisor: "Coty", pod: "pod2", wpa: "Vinny", onboardDate: "2025-04-22", monthlyFee: 9000, referralSource: "Client Referral" },
  { id: "c5", name: "Chris Licht", tier: "FFO", leadAdvisor: "Landon", pod: "pod1", wpa: "Thea", onboardDate: "2025-08-15", monthlyFee: 5000, referralSource: "COI Referral" },
  { id: "c6", name: "Justin Buonomo", tier: "FFO Light", leadAdvisor: "Coty", pod: "pod2", wpa: "Vinny", onboardDate: "2025-11-20", monthlyFee: 4500, referralSource: "Digital/Inbound" },
  { id: "c7", name: "Blake Saunders", tier: "FFO", leadAdvisor: "Landon", pod: "pod1", wpa: "Thea", onboardDate: "2025-03-15", monthlyFee: 12000, referralSource: "Client Referral" },
  { id: "c8", name: "Anthony Cirino", tier: "FFO", leadAdvisor: "Landon", pod: "pod1", wpa: "Thea", onboardDate: "2025-01-12", monthlyFee: 15000, referralSource: "Direct Outreach" },
];

// 16-metric scores (added Referral Activity [14] and Network Advocacy [15])
export const DEFAULT_SCORES: Score[] = [
  { clientId: "c1", year: 2026, month: 0, scores: [5,5,5,5,5,5,5,6,4,4,9,5,5,3,2,3], assessor: "Coty", notes: "Showing disengagement.", actionItems: "Upgrade or exit conversation", ts: "2026-01-30T11:30:00Z" },
  { clientId: "c2", year: 2026, month: 0, scores: [7,6,7,7,7,7,6,8,6,6,9,6,6,5,4,5], assessor: "Landon", notes: "Slow start.", actionItems: "Deep-dive call re: estate plan", ts: "2026-01-28T15:00:00Z" },
  { clientId: "c2", year: 2026, month: 1, scores: [5,5,6,6,6,6,5,7,5,5,8,5,5,4,3,4], assessor: "Landon", notes: "Declining. Missed two calls.", actionItems: "Escalate for intervention", ts: "2026-02-04T09:00:00Z" },
  { clientId: "c3", year: 2026, month: 0, scores: [7,7,7,7,7,7,7,8,7,6,10,7,7,6,5,6], assessor: "Coty", notes: "Establishing cadence.", actionItems: "30-day review", ts: "2026-01-30T10:00:00Z" },
  { clientId: "c3", year: 2026, month: 1, scores: [8,8,8,8,8,8,8,9,8,8,10,8,8,8,7,7], assessor: "Coty", notes: "Improving across the board.", actionItems: "", ts: "2026-02-05T14:00:00Z" },
  { clientId: "c4", year: 2026, month: 0, scores: [7,7,7,7,7,7,7,8,7,6,10,7,7,7,5,6], assessor: "Coty", notes: "Stable but not growing.", actionItems: "Plan Q1 strategy call", ts: "2026-01-29T15:00:00Z" },
  { clientId: "c4", year: 2026, month: 1, scores: [8,8,7,7,8,8,7,9,8,7,10,7,8,7,6,6], assessor: "Coty", notes: "Solid trajectory.", actionItems: "", ts: "2026-01-29T11:00:00Z" },
  { clientId: "c5", year: 2026, month: 0, scores: [8,8,7,8,8,8,7,9,8,7,10,8,8,7,6,7], assessor: "Landon", notes: "Good momentum.", actionItems: "", ts: "2026-01-31T13:00:00Z" },
  { clientId: "c6", year: 2026, month: 0, scores: [8,8,7,7,8,8,7,9,8,7,10,7,8,7,5,6], assessor: "Coty", notes: "Solid trajectory.", actionItems: "", ts: "2026-01-29T11:00:00Z" },
  { clientId: "c6", year: 2026, month: 1, scores: [8,8,8,8,8,8,8,9,8,8,10,8,8,8,7,7], assessor: "Coty", notes: "Improving across the board.", actionItems: "", ts: "2026-02-05T14:00:00Z" },
  { clientId: "c7", year: 2026, month: 0, scores: [9,9,8,9,9,9,8,10,9,8,10,9,9,10,9,9], assessor: "Landon", notes: "Excellent engagement. Proactively referring.", actionItems: "", ts: "2026-01-28T14:30:00Z" },
  { clientId: "c7", year: 2026, month: 1, scores: [9,8,9,9,10,9,8,9,9,9,10,9,8,10,9,10], assessor: "Landon", notes: "Tax strategy delivered early.", actionItems: "", ts: "2026-02-03T10:15:00Z" },
  { clientId: "c8", year: 2026, month: 0, scores: [9,9,9,9,9,10,9,10,9,9,10,9,9,10,10,10], assessor: "Landon", notes: "Top client. Referring actively.", actionItems: "", ts: "2026-01-27T09:00:00Z" },
  { clientId: "c8", year: 2026, month: 1, scores: [10,9,9,9,10,10,9,10,10,9,10,10,9,10,10,10], assessor: "Landon", notes: "Wow moment landed perfectly.", actionItems: "", ts: "2026-02-03T16:00:00Z" },
];

export const DEFAULT_NPS: NPSFeedback[] = [
  { id: "nps1", clientId: "c7", npsScore: 10, comment: "Absolutely love working with the team!", source: "Survey", assessor: "Landon", ts: "2026-01-20T10:00:00Z" },
  { id: "nps2", clientId: "c8", npsScore: 10, comment: "Best financial partner we've ever had.", source: "Call Notes", assessor: "Landon", ts: "2026-01-25T14:00:00Z" },
  { id: "nps3", clientId: "c1", npsScore: 5, comment: "Not sure we're getting enough value.", source: "Survey", assessor: "Coty", ts: "2026-01-28T09:00:00Z" },
  { id: "nps4", clientId: "c3", npsScore: 8, comment: "Good so far, looking forward to seeing results.", source: "Call Notes", assessor: "Coty", ts: "2026-02-01T11:00:00Z" },
];

export const DEFAULT_WOWS: Wow[] = [
  { id: "w1", clientId: "c7", date: "2026-01-15", description: "Personalized anniversary gift — framed photo from first meeting", type: "Gift", owner: "Landon", reaction: "Wife posted on Instagram" },
  { id: "w2", clientId: "c8", date: "2026-02-01", description: "Proactively identified $40K tax savings opportunity", type: "Proactive", owner: "Josh", reaction: "'This is why we pay you'" },
  { id: "w3", clientId: "c3", date: "2026-01-20", description: "Connected with contractor for office buildout", type: "Secret", owner: "Coty", reaction: "Very grateful" },
];

export const DEFAULT_REFERRALS: Referral[] = [
  { id: "r1", referrerId: "c8", referredClientId: "c7", date: "2025-02-20", source: "Client Referral", status: "Active", notes: "Anthony introduced Blake at a dinner event", revenueGenerated: 12000 },
  { id: "r2", referrerId: "c5", referredClientId: "c4", date: "2025-03-15", source: "Client Referral", status: "Active", notes: "Chris connected Victoria through business network", revenueGenerated: 9000 },
  { id: "r3", referrerId: "c7", referredClientId: "", date: "2026-01-20", source: "Client Referral", status: "Prospect", notes: "Blake referred a new prospect — in discovery", revenueGenerated: 0 },
];

// === STORAGE ===
export async function loadData(): Promise<AppData> {
  if (typeof window === "undefined") {
    return { clients: DEFAULT_CLIENTS, scores: DEFAULT_SCORES, wows: DEFAULT_WOWS, referrals: DEFAULT_REFERRALS, npsFeedback: DEFAULT_NPS };
  }
  try {
    // Try v7 first, then fall back to v6
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem("ffo-health-v6");
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.referrals) parsed.referrals = DEFAULT_REFERRALS;
      if (!parsed.npsFeedback) parsed.npsFeedback = [];

      // Migrate scores to 16-metric format
      if (parsed.scores && parsed.scores.length > 0) {
        parsed.scores = parsed.scores.map((score: Score) => {
          if (score.scores.length === 11) {
            const old = score.scores;
            return { ...score, scores: [old[0], old[2], old[1], old[3], old[3], old[7], old[7], 10 - old[7], old[6], old[6], 10, old[9], old[10], old[8], 5, 5] };
          }
          if (score.scores.length === 14) {
            // Migrate 14 → 16: add Referral Activity and Network Advocacy with defaults
            return { ...score, scores: [...score.scores, 5, 5] };
          }
          return score;
        });
      }

      // Migrate clients: add pod assignments if missing
      if (parsed.clients) {
        parsed.clients = parsed.clients.map((c: Client) => {
          if (!c.pod) {
            const pod = DEFAULT_PODS.find(p => p.advisors.includes(c.leadAdvisor));
            return { ...c, pod: pod?.id || "" };
          }
          return c;
        });
      }

      // Save as v7
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch { /* first load */ }
  const d: AppData = {
    clients: DEFAULT_CLIENTS, scores: DEFAULT_SCORES, wows: DEFAULT_WOWS,
    referrals: DEFAULT_REFERRALS, npsFeedback: DEFAULT_NPS,
    settings: { referralSources: REFERRAL_SOURCES, pods: DEFAULT_PODS }
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
  return d;
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// === WEALTHBOX SYNC ===
export async function syncFromWealthbox(): Promise<Client[]> {
  if (typeof window === "undefined") return [];
  try {
    const response = await fetch('/api/wealthbox/sync');
    const data = await response.json();
    if (data.success) return data.clients;
    throw new Error(data.error || 'Sync failed');
  } catch (error) {
    console.error('Failed to sync from Wealthbox:', error);
    throw error;
  }
}

export async function pushScoreToWealthbox(
  wealthboxId: string, score: number, status: string,
  dimensions: { engagement: number; responsiveness: number; profitability: number; advocacy: number; retention: number }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch('/api/wealthbox/push-score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wealthboxId, score, status, dimensions })
    });
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to push score to Wealthbox:', error);
    return false;
  }
}

export async function testWealthboxConnection(): Promise<{ success: boolean; message: string; count?: number }> {
  if (typeof window === "undefined") return { success: false, message: 'Not in browser' };
  try {
    const response = await fetch('/api/wealthbox/test');
    return await response.json();
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection test failed' };
  }
}

export async function importNewClientsFromWealthbox(existingClients: Client[]): Promise<{ newClients: Client[]; count: number }> {
  if (typeof window === "undefined") return { newClients: [], count: 0 };
  try {
    const wealthboxClients = await syncFromWealthbox();
    const existingWealthboxIds = new Set(existingClients.map(c => c.wealthboxId).filter(Boolean) as string[]);
    const newClients = wealthboxClients.filter(wc => wc.wealthboxId && !existingWealthboxIds.has(wc.wealthboxId));
    return { newClients, count: newClients.length };
  } catch (error) {
    console.error('Failed to import new clients from Wealthbox:', error);
    throw error;
  }
}

export async function enrichClientsWithTasks(clients: Client[]): Promise<Client[]> {
  if (typeof window === "undefined") return clients;
  try {
    const response = await fetch('/api/wealthbox/enrich-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients })
    });
    const data = await response.json();
    if (data.success) return data.clients;
    throw new Error(data.error || 'Failed to enrich clients with tasks');
  } catch (error) {
    console.error('Failed to enrich clients with tasks:', error);
    return clients;
  }
}

export async function fetchExecSummary(clientId: string, wealthboxId: string, lastScoredTs: string | null): Promise<ExecSummary> {
  if (typeof window === "undefined") throw new Error('Not in browser');
  const response = await fetch('/api/wealthbox/exec-summary', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, wealthboxId, lastCheckinDate: lastScoredTs })
  });
  const data = await response.json();
  if (data.success) return data.summary;
  throw new Error(data.error || 'Failed to fetch exec summary');
}
