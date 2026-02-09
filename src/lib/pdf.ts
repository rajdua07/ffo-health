// @ts-nocheck
import jsPDF from "jspdf";
import type { ClientStat, Score, Wow, Referral } from "./data";
import { calcScore, getStatus, dimAvg, DIMENSIONS, DIM_WEIGHTS, METRICS, MO, fmtM } from "./data";

const navy = [27, 42, 74];
const gray = [107, 114, 128];
const green = [22, 101, 52];
const amber = [133, 77, 14];
const red = [153, 27, 27];
const dark = [55, 65, 81];
const statusColor = (st) => st === "HEALTHY" ? green : st === "WATCH" ? amber : red;

export function exportClientPDF(client, scores, wows, referrals) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
  doc.setFillColor(...navy); doc.rect(0, 0, pw, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.text("FFO Client Health Report", 15, 15);
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text(client.name, 15, 23);
  doc.setFontSize(9);
  doc.text(`${client.tier}  ·  ${client.leadAdvisor}  ·  ${fmtM(client.monthlyFee)}/mo  ·  Since ${client.onboardDate}`, 15, 30);
  doc.setFontSize(8); doc.text(`Generated ${new Date().toLocaleDateString()}`, pw - 15, 30, { align: "right" });
  y = 45;

  // Score summary
  const score = client.latestScore;
  const status = client.status;
  const scCol = statusColor(status);
  doc.setTextColor(...navy); doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("Health Score Summary", 15, y); y += 10;
  doc.setFillColor(...scCol); doc.circle(30, y + 4, 10, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(score != null ? score.toFixed(1) : "—", 30, y + 7, { align: "center" });
  doc.setTextColor(...scCol); doc.setFontSize(16);
  doc.text(status || "UNSCORED", 48, y + 3);
  doc.setTextColor(...gray); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  const tText = client.prevScore != null ? `Previous: ${client.prevScore.toFixed(1)} (${score > client.prevScore ? "▲ Improving" : score < client.prevScore ? "▼ Declining" : "● Stable"})` : "No prior score";
  doc.text(tText, 48, y + 10);
  y += 22;

  // Dimensions
  doc.setTextColor(...navy); doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Dimension Breakdown", 15, y); y += 7;
  if (client.latest) {
    for (const dim of DIMENSIONS) {
      const avg = dimAvg(client.latest.scores, dim);
      const dc = statusColor(getStatus(avg));
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...navy);
      doc.text(`${dim} (${DIM_WEIGHTS[dim] * 100}%)`, 15, y);
      doc.setTextColor(...dc); doc.text(avg != null ? avg.toFixed(1) : "—", pw - 15, y, { align: "right" });
      y += 3;
      doc.setFillColor(229, 231, 235); doc.rect(15, y, pw - 30, 3, "F");
      if (avg != null) { doc.setFillColor(...dc); doc.rect(15, y, (pw - 30) * (avg / 10), 3, "F"); }
      y += 6;
      for (const m of METRICS.filter(x => x.dim === dim)) {
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
        doc.text(`  ${m.name} (${m.weight * 100}%)`, 18, y);
        doc.text(String(client.latest.scores[m.id]), pw - 15, y, { align: "right" }); y += 4;
      }
      y += 3;
    }
  }

  // Trend
  const cs = scores.filter(s => s.clientId === client.id).sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  if (cs.length > 1) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...navy); doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Score Trend", 15, y); y += 8;
    const tW = pw - 30; const tH = 30;
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
    [0, 5, 10].forEach(v => { const ly = y + tH - (v / 10) * tH; doc.line(15, ly, pw - 15, ly); doc.setFontSize(6); doc.setTextColor(...gray); doc.text(String(v), 12, ly + 1, { align: "right" }); });
    doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.8);
    const pts = cs.map((s, i) => ({ x: 15 + (i / (cs.length - 1)) * tW, y: y + tH - ((calcScore(s.scores) || 0) / 10) * tH }));
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    pts.forEach(p => { doc.setFillColor(59, 130, 246); doc.circle(p.x, p.y, 1.5, "F"); });
    y += tH + 8;
  }

  // Wow Moments
  const cw = (wows || []).filter(w => w.clientId === client.id);
  if (cw.length > 0) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setTextColor(...navy); doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Wow Moments", 15, y); y += 7;
    cw.forEach(w => {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...amber);
      doc.text(`★ ${w.type}`, 15, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...gray);
      doc.text(`${w.date} · ${w.owner}`, pw - 15, y, { align: "right" }); y += 5;
      doc.setFontSize(8); doc.setTextColor(...dark);
      const lines = doc.splitTextToSize(w.description, pw - 30);
      doc.text(lines, 15, y); y += lines.length * 4 + 5;
    });
  }

  // Referrals
  const cr = (referrals || []).filter(r => r.referrerId === client.id);
  if (cr.length > 0) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setTextColor(...navy); doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Referrals Generated", 15, y); y += 7;
    cr.forEach(r => {
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
      doc.text(`• ${r.notes || "Referral"} — ${r.status}`, 15, y);
      if (r.revenueGenerated > 0) { doc.setTextColor(...green); doc.text(fmtM(r.revenueGenerated) + "/mo", pw - 15, y, { align: "right" }); }
      y += 5;
    });
  }

  // Footer
  const pc = doc.getNumberOfPages();
  for (let i = 1; i <= pc; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...gray);
    doc.text("Confidential — FFO Fractional Family Office", 15, doc.internal.pageSize.getHeight() - 5);
    doc.text(`Page ${i} of ${pc}`, pw - 15, doc.internal.pageSize.getHeight() - 5, { align: "right" });
  }
  doc.save(`FFO_Health_Report_${client.name.replace(/\s+/g, "_")}.pdf`);
}

export function exportPortfolioPDF(stats, referrals) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFillColor(...navy); doc.rect(0, 0, pw, 30, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont("helvetica", "bold");
  doc.text("FFO Portfolio Health Summary", 15, 14);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 15, 24);
  y = 40;

  const totalRev = stats.reduce((s, c) => s + (c.monthlyFee || 0), 0);
  const scored = stats.filter(c => c.latestScore != null);
  const avg = scored.length ? scored.reduce((s, c) => s + (c.latestScore || 0), 0) / scored.length : 0;
  const h = scored.filter(c => c.status === "HEALTHY").length;
  const w = scored.filter(c => c.status === "WATCH").length;
  const r = scored.filter(c => c.status === "AT RISK").length;

  doc.setTextColor(...navy); doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Portfolio Overview", 15, y); y += 8;
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...dark);
  [`Total Clients: ${stats.length}  ·  Monthly Revenue: ${fmtM(totalRev)}  ·  Annual: ${fmtM(totalRev * 12)}`,
   `Average Score: ${avg.toFixed(1)}  ·  Healthy: ${h}  ·  Watch: ${w}  ·  At Risk: ${r}`
  ].forEach(line => { doc.text(line, 15, y); y += 5; });
  y += 5;

  // Table
  doc.setTextColor(...navy); doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("All Clients", 15, y); y += 7;
  doc.setFillColor(243, 244, 246); doc.rect(15, y - 4, pw - 30, 6, "F");
  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...navy);
  const cols = [15, 65, 90, 115, 140, 165];
  ["Client", "Tier", "Advisor", "Score", "Status", "Revenue"].forEach((h, i) => doc.text(h, cols[i], y));
  y += 5;

  doc.setFont("helvetica", "normal");
  [...stats].sort((a, b) => (a.latestScore || 0) - (b.latestScore || 0)).forEach(c => {
    if (y > 270) { doc.addPage(); y = 20; }
    const scC = statusColor(c.status);
    doc.setFontSize(7); doc.setTextColor(...dark);
    doc.text(c.name.substring(0, 28), cols[0], y);
    doc.text(c.tier, cols[1], y);
    doc.text(c.leadAdvisor, cols[2], y);
    doc.setTextColor(...scC);
    doc.text(c.latestScore != null ? c.latestScore.toFixed(1) : "—", cols[3], y);
    doc.text(c.status || "—", cols[4], y);
    doc.setTextColor(...dark);
    doc.text(fmtM(c.monthlyFee), cols[5], y);
    y += 5;
  });

  const pc = doc.getNumberOfPages();
  for (let i = 1; i <= pc; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...gray);
    doc.text("Confidential — FFO Fractional Family Office", 15, doc.internal.pageSize.getHeight() - 5);
    doc.text(`Page ${i} of ${pc}`, pw - 15, doc.internal.pageSize.getHeight() - 5, { align: "right" });
  }
  doc.save("FFO_Portfolio_Health_Summary.pdf");
}
