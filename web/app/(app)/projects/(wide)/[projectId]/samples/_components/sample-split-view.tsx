"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type SampleListItem,
  type SampleWithInfo,
  useSampleSelection,
} from "../_hooks/use-sample-selection";
import { SampleDetailPane } from "./sample-detail-pane";
import { SampleListPane } from "./sample-list-pane";

interface SamplesSplitViewProps {
  children: React.ReactNode;

  samples: SampleWithInfo[];

  datasets: Array<{ id: string; name: string }>;
  selectedDatasetId: string | null;
  filterDataset?: { id: string; name: string };
  clearFilterHref?: string;
}

const ITEMS_PER_PAGE = 10;

function formatDate(d: Date) {
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * hash から sampleId を読む: #sampleId=xxxx
 */
function readSampleIdFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash || "";
  const s = h.startsWith("#") ? h.slice(1) : h;
  const params = new URLSearchParams(s);
  return params.get("sampleId");
}

/**
 * hash に sampleId を書く（他の hash パラメータがあれば保持）
 */
function writeSampleIdToHash(sampleId: string | null) {
  if (typeof window === "undefined") return;

  const h = window.location.hash || "";
  const s = h.startsWith("#") ? h.slice(1) : h;
  const params = new URLSearchParams(s);

  if (sampleId) params.set("sampleId", sampleId);
  else params.delete("sampleId");

  const next = params.toString();
  const nextHash = next ? `#${next}` : "";

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}

export function SamplesSplitView(props: SamplesSplitViewProps) {
  const {
    children,
    samples,
    datasets,
    selectedDatasetId,
    filterDataset,
    clearFilterHref,
  } = props;

  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const selection = useSampleSelection({ samples });
  const {
    selectedId,
    selectedSample,
    selectedInfo,
    selectSample,
    clearSelection,
  } = selection;

  /**
   * dataset filter は従来通り searchParams（=サーバ取得に影響するので）
   */
  const onChangeDataset = useCallback(
    (datasetId: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());

      if (datasetId) sp.set("datasetId", datasetId);
      else sp.delete("datasetId");

      // dataset変えたら sample選択は外し、hashも消す（混乱防止）
      clearSelection();
      writeSampleIdToHash(null);

      router.push(`?${sp.toString()}`);
      setCurrentPage(1);
    },
    [router, searchParams, clearSelection],
  );

  const onClearFilter = useMemo(() => {
    if (!filterDataset || !clearFilterHref) return null;
    return () => {
      clearSelection();
      writeSampleIdToHash(null);
      router.push(clearFilterHref);
    };
  }, [filterDataset, clearFilterHref, router, clearSelection]);

  /**
   * 検索フィルタ（クライアントだけ）
   */
  const filteredSamples = useMemo(() => {
    if (!searchQuery.trim()) return samples;

    const q = searchQuery.toLowerCase();
    return samples.filter((s) => {
      if (s.id?.toLowerCase().includes(q)) return true;
      if (s.message.toLowerCase().includes(q)) return true;
      return formatDate(s.createdAt).toLowerCase().includes(q);
    });
  }, [samples, searchQuery]);

  /**
   * ページング
   */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredSamples.length / ITEMS_PER_PAGE)),
    [filteredSamples.length],
  );

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSamples.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSamples, currentPage]);

  /**
   * クリック：選択 + hash更新（sampleId）
   */
  const handleSelectSample = useCallback(
    (s: SampleWithInfo) => {
      selectSample(s);
      writeSampleIdToHash(s.id ?? null);
    },
    [selectSample],
  );

  /**
   * 初期復元：hash の sampleId から選択を復元
   * + 戻る/進む、手動hash変更にも追従（hashchange）
   */
  useEffect(() => {
    const applyFromHash = () => {
      const sampleId = readSampleIdFromHash();
      if (!sampleId) return;

      if (selectedId === sampleId) return;

      const found = samples.find((s) => s.id === sampleId);
      if (found) {
        selectSample(found);
      } else {
        // 見つからないなら hash を消して選択解除（任意）
        writeSampleIdToHash(null);
        clearSelection();
      }
    };

    applyFromHash();

    const onHashChange = () => applyFromHash();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [samples, selectedId, selectSample, clearSelection]);

  /**
   * フィルタ（検索/データセット変更/データ更新）で選択が一覧外になったら hash も消す
   * ※ useSampleSelection 内でも clear しているが、URLも同期したいのでここで消す
   */
  useEffect(() => {
    if (!selectedId) return;

    const exists = filteredSamples.some((s) => s.id === selectedId);
    if (!exists) {
      clearSelection();
      writeSampleIdToHash(null);
    }
  }, [filteredSamples, selectedId, clearSelection]);

  /**
   * hooks の後に early return
   */
  if (samples.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">サンプルがありません</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <SampleListPane
        samples={paginated as SampleListItem[]}
        selectedId={selectedId}
        datasets={datasets}
        selectedDatasetId={selectedDatasetId}
        onChangeDataset={onChangeDataset}
        filterDataset={filterDataset}
        onClearFilter={onClearFilter ?? undefined}
        searchQuery={searchQuery}
        onChangeSearchQuery={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        totalPages={totalPages}
        onChangePage={setCurrentPage}
        onSelectSample={handleSelectSample}
      >
        {children}
      </SampleListPane>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-auto p-6">
          <SampleDetailPane
            selectedId={selectedId}
            selectedInfo={selectedInfo}
            selectedSample={selectedSample}
          />
        </div>
      </div>
    </div>
  );
}
