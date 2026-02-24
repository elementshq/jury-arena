"use client";

import type * as React from "react";

export function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex h-[56px] items-center justify-between">
      {children}
    </div>
  );
}
