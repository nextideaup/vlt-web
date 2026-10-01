"use client";

import { useRevalue } from "@/lib/RevalueContext";

export default function RevalueBanner() {
  const { state, dismiss } = useRevalue();

  if (!state || state.isDismissed) return null;

  const valued = state.results.filter((r) => !r.error).length;
  const failed = state.results.filter((r) => r.error).length;
  const rateLimited = state.results.filter((r) => r.rateLimited).length;

  // Remaining items still to value
  const remaining = Math.max(0, state.total - state.done);
  // ~30s per item (8s delay + ~20s for the API call)
  const estMinutes = Math.ceil((remaining * 30) / 60);

  const hasIssues = failed > 0;
  const allRateLimited = rateLimited > 0 && rateLimited === failed;

  return (
    <div className="fixed top-16 left-0 right-0 z-60 pointer-events-none">
      <div className="pointer-events-auto">
        {/* Banner */}
        <div className="mx-auto max-w-xl mt-3 mr-4 ml-auto">
          <div className="bg-surface border border-border rounded-xl shadow-xl shadow-black/30 px-4 py-3 flex items-center gap-3">
            {state.isRunning ? (
              <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
            ) : hasIssues ? (
              allRateLimited ? (
                <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              )
            ) : (
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}

            <div className="flex-1 min-w-0">
              {state.isRunning ? (
                <>
                  <p className="text-xs font-medium text-text">
                    Revaluing collection — {state.done} / {state.total}
                    {remaining > 0 && estMinutes > 0 && (
                      <span className="text-text-dim font-normal"> · ~{estMinutes}m remaining</span>
                    )}
                  </p>
                  {state.current && (
                    <p className="text-xs text-text-muted truncate mt-0.5">{state.current}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-text">
                    Revalue complete —{" "}
                    <span className="text-green-400">{valued} valued</span>
                    {failed > 0 && (
                      <span className={allRateLimited ? "text-orange-400" : "text-yellow-400"}>
                        {" "}· {failed} failed
                      </span>
                    )}
                  </p>
                  {allRateLimited && (
                    <p className="text-xs text-orange-400 mt-0.5">
                      Rate limit reached — re-run Revalue Collection to retry failed items
                    </p>
                  )}
                  {hasIssues && !allRateLimited && rateLimited > 0 && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {rateLimited} failed due to rate limiting — retry those items shortly
                    </p>
                  )}
                </>
              )}
            </div>

            {!state.isRunning && (
              <button
                aria-label="Dismiss"
                onClick={dismiss}
                className="w-6 h-6 rounded-lg hover:bg-surface-3 text-text-dim hover:text-text transition-colors flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
