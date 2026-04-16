"use client";
import { useState, useEffect } from "react";

export default function SurveyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [gap, setGap] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (!t) {
      setError("Invalid survey link. Please check the URL you received.");
      setLoading(false);
      return;
    }
    setToken(t);

    fetch(`/api/nps-survey?token=${encodeURIComponent(t)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setClientName(data.clientName);
          setClientId(data.clientId);
        } else {
          setError(data.error || "Invalid survey link.");
        }
      })
      .catch(() => setError("Failed to load survey."))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (score == null || !token) return;
    setSubmitting(true);

    // Build the combined comment with both follow-up and gap answers
    const parts: string[] = [];
    if (followUp.trim()) parts.push(followUp.trim());
    if (gap.trim()) parts.push(`[Gap] ${gap.trim()}`);
    const comment = parts.join("\n\n");

    try {
      const resp = await fetch("/api/nps-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, npsScore: score, comment }),
      });
      const data = await resp.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || "Failed to submit.");
      }
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B2A4A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !clientId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-[#1B2A4A] mb-3">Thank you!</h2>
          <p className="text-gray-600 text-base">Your feedback has been recorded. We truly appreciate you taking the time to share your thoughts with us.</p>
        </div>
      </div>
    );
  }

  // Pick follow-up prompt based on score
  const followUpPrompt = score == null ? ""
    : score >= 9 ? "What's the one thing we do best that you'd tell a peer about?"
    : score >= 7 ? "What would take us from good to great for you?"
    : "What's the most important thing we could improve?";

  const followUpPlaceholder = score == null ? ""
    : score >= 9 ? "Our proactive tax planning, the coordination across advisors, a specific team member..."
    : score >= 7 ? "More proactive communication, faster response times, deeper strategy work..."
    : "Honest feedback helps us serve you better...";

  const npsLabels = ["Not at all likely", "Extremely likely"];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 bg-[#1B2A4A] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="text-lg font-bold text-[#1B2A4A]">Fractional Family Office</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">How are we doing?</h1>
          <p className="text-gray-500 text-sm">Hi {clientName}, we&apos;d love your honest feedback.</p>
        </div>

        {/* Q1: NPS Score */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-4">
            How likely are you to recommend Fractional Family Office to a friend or peer?
          </p>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => setScore(i)}
                className={`aspect-square rounded-lg text-sm font-semibold transition-all ${
                  score === i
                    ? i <= 6 ? "bg-red-500 text-white scale-110 shadow-md"
                      : i <= 8 ? "bg-amber-500 text-white scale-110 shadow-md"
                      : "bg-green-500 text-white scale-110 shadow-md"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">{npsLabels[0]}</span>
            <span className="text-[10px] text-gray-400">{npsLabels[1]}</span>
          </div>
        </div>

        {/* Q2: Conditional follow-up based on score */}
        {score !== null && (
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-700 block mb-2">
              {followUpPrompt}
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              placeholder={followUpPlaceholder}
            />
          </div>
        )}

        {/* Q3: Gap question — shown after score is picked */}
        {score !== null && (
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Is there anything you wish we were helping with that we&apos;re not?
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              value={gap}
              onChange={e => setGap(e.target.value)}
              placeholder="Anything you've been thinking about but haven't raised yet..."
            />
          </div>
        )}

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={score == null || submitting}
          className="w-full bg-[#1B2A4A] text-white py-3 rounded-lg font-medium hover:bg-[#2a3d66] disabled:opacity-40 transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </button>

        <p className="text-[10px] text-gray-400 text-center mt-4">
          Your response is confidential and helps us improve our service to you.
        </p>
      </div>
    </div>
  );
}
