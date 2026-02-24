"use client";

export function SampleDetailEmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-lg font-semibold text-slate-900">
          Sample details
        </div>
        <div className="mt-2 text-sm text-slate-500">
          Select a sample from the left list to inspect input / output /
          metadata
        </div>
      </div>
    </div>
  );
}
