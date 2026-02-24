import {
  type BenchmarkStatus,
  getBenchmarkRuntime,
  subscribe,
  subscribeIngest,
  subscribeStatus,
} from "@/lib/benchmark-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusToEvent(status: BenchmarkStatus) {
  if (status === "finished") return "done";
  if (status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  return null;
}

type RatingReplayPayload = {
  step: number;
  ratings: Record<string, number>;
};

type BundlePayload = {
  message?: string;
  rating?: RatingReplayPayload;
  raw?: unknown;
};

function toRatingsFromRow(row: { step: number; [modelName: string]: number }) {
  const { step, ...rest } = row as any;
  const ratings: Record<string, number> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === "number") ratings[k] = v;
  }
  return { step: Number(step), ratings };
}

function makeRatingLogLine(payload: RatingReplayPayload) {
  const parts = Object.entries(payload.ratings)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return `[RATING] step=${payload.step}${parts ? " " + parts : ""}`;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ benchmarkId: string }> },
) {
  const { benchmarkId } = await ctx.params;

  const rt = getBenchmarkRuntime(benchmarkId);
  if (!rt) {
    return new Response("not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  let unsubscribeLog: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let unsubscribeIngest: (() => void) | null = null;
  let closed = false;

  const closeOnce = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (closed) return;
    closed = true;

    unsubscribeLog?.();
    unsubscribeLog = null;

    unsubscribeStatus?.();
    unsubscribeStatus = null;

    unsubscribeIngest?.();
    unsubscribeIngest = null;

    try {
      controller.close();
    } catch {
      // ignore
    }
  };

  const send = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    chunk: string,
  ) => {
    controller.enqueue(encoder.encode(chunk));
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // 1) 既存ログ replay
      for (const item of rt.state.logs) {
        send(controller, `data: ${item.message}\n\n`);
      }

      // 1.2) 既存 ratingSeries replay（チャート初期化用）
      if (rt.state.ratingSeries?.length) {
        for (const row of rt.state.ratingSeries) {
          const payload = toRatingsFromRow(row as any);
          send(
            controller,
            `event: rating\ndata: ${JSON.stringify(payload)}\n\n`,
          );
        }
      }

      // 1.5) 既に終了しているなら終端返してclose
      const already = statusToEvent(rt.state.status);
      if (already) {
        send(controller, `event: ${already}\ndata: ${rt.state.status}\n\n`);
        closeOnce(controller);
        return;
      }

      // 2) リアルタイムログ購読
      const subLog = subscribe(benchmarkId, (line) => {
        send(controller, `data: ${line}\n\n`);
      });
      if (!subLog.ok) {
        send(controller, `event: error\ndata: subscribe failed\n\n`);
        closeOnce(controller);
        return;
      }
      unsubscribeLog = subLog.unsubscribe;

      // 3) ingest購読（ここで rating_step を bundle として “送信”）
      const subIngest = subscribeIngest(benchmarkId, (ev) => {
        if (ev.type === "rating_step") {
          const payload = toRatingsFromRow(ev.ratingsRow as any);
          const msg = makeRatingLogLine(payload);

          // (A) ログレーンにも送る（ログと同じ瞬間に表示）
          // ※UIが bundle.message を表示する場合は二重になるので、ここを消して bundle一本にしてください
          send(controller, `data: ${msg}\n\n`);

          // (B) チャート更新用 bundle を送る（ログと同じ瞬間に届く）
          const bundle: BundlePayload = {
            message: msg,
            rating: payload,
            raw: ev, // 不要なら消してOK
          };

          send(
            controller,
            `event: bundle\ndata: ${JSON.stringify(bundle)}\n\n`,
          );
          return;
        }

        // rating_step以外は従来どおり ingest として送る
        send(controller, `event: ingest\ndata: ${JSON.stringify(ev)}\n\n`);
      });

      if (!subIngest.ok) {
        send(controller, `event: error\ndata: subscribeIngest failed\n\n`);
        closeOnce(controller);
        return;
      }
      unsubscribeIngest = subIngest.unsubscribe;

      // 4) ステータス購読
      const subStatus = subscribeStatus(benchmarkId, (status) => {
        const ev = statusToEvent(status);
        if (!ev) return;

        send(controller, `event: ${ev}\ndata: ${status}\n\n`);
        closeOnce(controller);
      });
      if (!subStatus.ok) {
        send(controller, `event: error\ndata: subscribeStatus failed\n\n`);
        closeOnce(controller);
        return;
      }
      unsubscribeStatus = subStatus.unsubscribe;

      // 5) クライアント切断
      req.signal.addEventListener("abort", () => closeOnce(controller), {
        once: true,
      });
    },

    cancel() {
      unsubscribeLog?.();
      unsubscribeLog = null;

      unsubscribeStatus?.();
      unsubscribeStatus = null;

      unsubscribeIngest?.();
      unsubscribeIngest = null;

      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
