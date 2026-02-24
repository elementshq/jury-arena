# test_benchmark_args.py
import argparse
import time
import sys
import json
import signal
import traceback

def main():
    parser = argparse.ArgumentParser(description="ベンチマークを実行")
    parser.add_argument("project_name", type=str, help="プロジェクト名")
    parser.add_argument("dataset_name", type=str, help="データセット名")
    parser.add_argument("--config", type=str, help="設定ファイルのパス（新規実行時は必須）")
    parser.add_argument("--benchmark-name", type=str, help="ベンチマーク名（省略時はdatetime）")
    parser.add_argument("--resume", action="store_true", help="既存のベンチマークを再開")

    args = parser.parse_args()

    # SIGTERM / SIGINT を受け取れるように（stop テスト用）
    def on_term(signum, frame):
        print(f"[SYSTEM] signal {signum} received, exiting...", flush=True)
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    # 起動直後に引数を全部表示（argv も表示すると呼び出しミスが即分かる）
    print("=== TEST BENCHMARK START ===", flush=True)
    print("[ARGV]", json.dumps(sys.argv, ensure_ascii=False), flush=True)
    print("[ARGS]", json.dumps(vars(args), ensure_ascii=False), flush=True)

    # config の中身を読むテスト（あれば）
    if args.config:
        try:
            with open(args.config, "r", encoding="utf-8") as f:
                content = f.read()
            print("[CONFIG FILE CONTENT]", content[:500], flush=True)
        except Exception as e:
            print(f"[CONFIG FILE ERROR] {e}", flush=True)

    # 疑似実行（20秒）
    for i in range(1, 21):
        print(f"[STEP] {i}/20 sleeping...", flush=True)
        time.sleep(1)

    print("=== TEST BENCHMARK FINISHED ===", flush=True)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        print("[FATAL] exception occurred:", flush=True)
        traceback.print_exc()
        raise SystemExit(1)
