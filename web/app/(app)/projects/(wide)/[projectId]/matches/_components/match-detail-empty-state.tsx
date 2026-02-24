"use client";

export function MatchDetailEmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-lg font-semibold text-slate-900">
          Match details
        </div>
        <div className="mt-2 text-sm text-slate-500">
          Select a match from the left list to inspect input / output / judge
        </div>
      </div>
    </div>
  );
}
