"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";

export function ConditionalGA() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    if (!gaId) return;

    const isTargetHost =
      window.location.hostname === "elementshq.github.io";
    const isTargetPath =
      window.location.pathname.startsWith("/jury-arena/demo/");

    if (isTargetHost && isTargetPath) {
      setEnabled(true);
    }
  }, []);

  if (!enabled) return null;

  return <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />;
}
