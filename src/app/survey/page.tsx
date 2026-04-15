"use client";
import { useState, useEffect } from "react";

export default function SurveyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
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
        <div className="text-gray-500">Loading survey...</div>
      </div>
    );
  }

  if (error && !clientId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">:(</div>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">Thank you!</div>
          <p className="text-gray-600 text-lg">Your feedback has been recorded. We truly appreciate you taking the time to share your thoughts with us.</p>
        </div>
      </div>
    );
  }

  const npsLabels = ["Not at all likely", "", "", "", "", "Neutral", "", "", "", "", "Extremely likely"];

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

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-4">
            On a scale of 0-10, how likely are you to recommend our services to a friend or colleague?
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
            <span className="text-[10px] text-gray-400">{npsLabels[10]}</span>
          </div>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 block mb-2">
            Any additional comments? (optional)
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Tell us what we're doing well, or how we can improve..."
          />
        </div>

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
