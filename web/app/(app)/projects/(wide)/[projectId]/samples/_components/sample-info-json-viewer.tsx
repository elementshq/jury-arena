"use client";

import dynamic from "next/dynamic";
import type { SampleInfo } from "@/lib/db/types/jsonb";

const ReactJson = dynamic(() => import("@microlink/react-json-view"), {
  ssr: false,
});

export function SampleInfoJsonViewer(props: { info: SampleInfo }) {
  const { info } = props;

  return (
    <div className="bg-white border border-slate-200 flex-1 min-h-0 overflow-hidden">
      <div className="p-4 h-full overflow-auto">
        <ReactJson
          src={info}
          name={false}
          theme="rjv-default"
          collapsed={false}
          enableClipboard={false}
          displayDataTypes={false}
          displayObjectSize={false}
          style={{ backgroundColor: "transparent" }}
        />
      </div>
    </div>
  );
}
