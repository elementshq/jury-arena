# -*- coding: utf-8 -*-
import math
import random
import pandas as pd
from datetime import datetime
from itertools import product
from uuid import uuid4

# -----------------------------
# ユーザー調整しやすい設定
# -----------------------------
SEED = 42
random.seed(SEED)

# 生成件数を抑えたい場合はここで各直積の上限を設定
MAX_MODELS_PER_FAMILY = 2  # 各ファミリーのモデル数（小さめに）
OUTPUT_CSV = "samples.csv"

# 入力トークンとデータセット種別（今回は固定）
INPUT_TOKENS = 10_000
DATASET_TYPE = "synthesis"

# フレームワーク（推論フレームワーク）
FRAMEWORKS = [
    {"name": "vLLM", "fw_efficiency": 1.00, "batching_gain": 1.15},
    {"name": "SGLang", "fw_efficiency": 1.05, "batching_gain": 1.20},
    # TritonはNVIDIAのみで使う想定
    {
        "name": "Triton",
        "fw_efficiency": 1.10,
        "batching_gain": 1.10,
        "vendor_only": "NVIDIA",
    },
]

# ベンダごとの“らしさ”係数（大雑把なダミー）
VENDOR_PROFILE = {
    "NVIDIA": {"hw_util_base": 0.50, "gamma": 0.06, "launch_overhead_ms": 20},
    "AMD": {"hw_util_base": 0.40, "gamma": 0.12, "launch_overhead_ms": 35},
    "Intel": {
        "hw_util_base": 0.35,
        "gamma": 0.12,
        "launch_overhead_ms": 40,
    },  # Intel GPU/HPUをひとまとめに簡略
    "Groq": {"hw_util_base": 0.60, "gamma": 0.05, "launch_overhead_ms": 15},
    "Cerebras": {"hw_util_base": 0.50, "gamma": 0.05, "launch_overhead_ms": 25},
    "SuperNova": {
        "hw_util_base": 0.45,
        "gamma": 0.10,
        "launch_overhead_ms": 30,
    },  # 想定ベンダ（占位）
}

# 各ベンダのSKU（ピークFLOPSとメモリ帯域は“それっぽい”ダミー）
# 単位: FLOPS=TFLOPS相当（FP8相当の比較用）、帯域=GB/s（ボード/カード合計想定）
SKU = {
    "NVIDIA": [
        {"chip": "H100-80GB", "peak_flops": 2000, "mem_bw": 3000, "vram_gb": 80},
        {"chip": "H200-141GB", "peak_flops": 2600, "mem_bw": 4200, "vram_gb": 141},
        {"chip": "B200-192GB", "peak_flops": 3200, "mem_bw": 5000, "vram_gb": 192},
    ],
    "AMD": [
        {"chip": "MI300X-192GB", "peak_flops": 2400, "mem_bw": 4600, "vram_gb": 192},
        {"chip": "MI325X-256GB", "peak_flops": 3000, "mem_bw": 5200, "vram_gb": 256},
    ],
    "Intel": [
        {"chip": "Gaudi3-128GB", "peak_flops": 1800, "mem_bw": 3800, "vram_gb": 128},
        {"chip": "XPU-Max-96GB", "peak_flops": 1400, "mem_bw": 2600, "vram_gb": 96},
    ],
    "Groq": [
        {"chip": "LPU-3-64GB", "peak_flops": 1600, "mem_bw": 2400, "vram_gb": 64},
        {"chip": "LPU-3-128GB", "peak_flops": 2000, "mem_bw": 3000, "vram_gb": 128},
    ],
    "Cerebras": [
        {"chip": "WSE-3-850GB", "peak_flops": 2800, "mem_bw": 8000, "vram_gb": 850},
        {"chip": "WSE-3-425GB", "peak_flops": 2200, "mem_bw": 6000, "vram_gb": 425},
    ],
    "SuperNova": [
        {"chip": "SN1-120GB", "peak_flops": 1500, "mem_bw": 2200, "vram_gb": 120},
        {"chip": "SN2-192GB", "peak_flops": 2100, "mem_bw": 3200, "vram_gb": 192},
    ],
}

# 枚数バリエーション（1,2,4,8）
GPU_COUNTS = [1, 2, 4, 8]

# モデル（定番の組み合わせだけ・dtype/量子化は名称に吸収）
MODEL_FAMILIES = {
    "Llama": [
        {"model_name": "Llama-70B-FP8", "params_total_b": 70, "params_active_b": 70},
        {
            "model_name": "Llama-405B-MoE-A55B-FP8",
            "params_total_b": 405,
            "params_active_b": 55,
        },
        {"model_name": "Llama-8B-FP8", "params_total_b": 8, "params_active_b": 8},
    ],
    "Qwen": [
        {"model_name": "Qwen2.5-72B-FP8", "params_total_b": 72, "params_active_b": 72},
        {
            "model_name": "Qwen3-Coder-480B-A35B-FP8",
            "params_total_b": 480,
            "params_active_b": 35,
        },
        {"model_name": "Qwen2.5-14B-FP8", "params_total_b": 14, "params_active_b": 14},
    ],
    "DeepSeek": [
        {
            "model_name": "DeepSeek-V3-671B-A37B-FP8",
            "params_total_b": 671,
            "params_active_b": 37,
        },
        {
            "model_name": "DeepSeek-R1-70B-FP8",
            "params_total_b": 70,
            "params_active_b": 70,
        },
    ],
    "ChatGPT-OSS": [
        {
            "model_name": "chatgpt-oss-120B-FP8",
            "params_total_b": 120,
            "params_active_b": 120,
        },
        {"model_name": "chatgpt-oss-7B-FP8", "params_total_b": 7, "params_active_b": 7},
    ],
}

# 各ファミリーから上限数だけサンプリング（規模を抑制）
for fam, models in MODEL_FAMILIES.items():
    random.shuffle(models)
    MODEL_FAMILIES[fam] = models[:MAX_MODELS_PER_FAMILY]

# ---------------------------------
# 計算式（シンプル版・“それっぽい”近似）
# ---------------------------------

# 係数（単位整合は係数に吸収）
Kp = 6.0  # Prefillの仕事量係数
Kd = 1.0  # Decodeの仕事量/トークン係数
Km = 0.008  # Prefillのメモリ量(GB)の係数
Kkv = 0.0008  # Decode時の1トークンあたりメモリ量(GB)
N_REF = 4096  # Attention増加の基準
E2E_OVERLAP = 0.9  # 8並列時の重畳ロス（固定）


def attention_factor(n_tokens: int) -> float:
    return 1.0 + (n_tokens / N_REF)


def scale_eff(num_gpus: int, gamma: float) -> float:
    # 単純な逓減モデル（ノード跨ぎなしの想定）
    return max(0.5, 1.0 - gamma * (num_gpus - 1) / max(1, num_gpus))


def decide_concurrency(num_gpus: int, vram_total_gb: float) -> int:
    # 「基本MAXで送る」をシンプルに近似：
    #   - VRAMと枚数に比例して上げるが、過剰にはしない
    #   - 例: 1枚で 8〜16、8枚で 32〜64 程度に
    base = 8 * num_gpus
    bonus = int(vram_total_gb / 128)  # 128GBあたり+1
    return max(8, min(64, base + bonus))


def compute_metrics(
    vendor: str, chip_info: dict, num_gpus: int, framework: dict, model: dict
):
    prof = VENDOR_PROFILE[vendor]
    hw_util_base = prof["hw_util_base"]
    gamma = prof["gamma"]
    launch_ms = prof["launch_overhead_ms"]

    # ピーク性能/帯域は素朴に枚数で線形合算（実効はscale_effで減衰）
    peak = chip_info["peak_flops"] * num_gpus
    bw = chip_info["mem_bw"] * num_gpus
    vram_total = chip_info["vram_gb"] * num_gpus

    sc_eff = scale_eff(num_gpus, gamma)
    eff_flops = peak * hw_util_base * framework["fw_efficiency"] * sc_eff  # TFLOPS相当
    eff_bw = bw * sc_eff  # GB/s

    # concurrency（MAXで投げる想定）
    conc = decide_concurrency(num_gpus, vram_total)

    # モデル規模
    P = model["params_active_b"]  # MoEはactiveを使う
    N_in = INPUT_TOKENS

    # Prefill：仕事量とメモリ量
    work_prefill = Kp * P * N_in * attention_factor(N_in)
    t_prefill_compute = work_prefill / max(1e-6, eff_flops)
    bytes_prefill_gb = Km * P * N_in
    t_prefill_mem = bytes_prefill_gb / max(1e-6, eff_bw)

    TTFT_s = (launch_ms / 1000.0) + max(t_prefill_compute, t_prefill_mem)

    # Decode：計算/メモリ側の上限
    work_decode_per_tok = Kd * P
    decode_tps_compute = eff_flops / max(1e-6, work_decode_per_tok)
    bytes_per_tok_gb = Kkv * P
    decode_tps_mem = eff_bw / max(1e-6, bytes_per_tok_gb)

    decode_tps_raw = min(decode_tps_compute, decode_tps_mem)
    decode_tps = decode_tps_raw * framework["batching_gain"]

    # 出力量はベンチにより異なるが、E2Eの見栄えのため“代表値”を仮で置く（固定）
    N_out = 256
    e2e_latency = TTFT_s + (N_out / max(1e-6, decode_tps))

    # システム出力トークンスループット（同時実行ぶんを掛ける）
    system_ott = decode_tps * conc * E2E_OVERLAP

    # RPS（簡便）：1リクエストのE2Eに対して同時実行で割る
    rps = conc / max(1e-6, e2e_latency)

    return {
        "TTFT_s": TTFT_s,
        "decode_tps_token_s": decode_tps,
        "e2e_latency_s": e2e_latency,
        "system_ott_token_s": system_ott,
        "rps": rps,
        "concurrency": conc,
        "vram_total_gb": vram_total,
        "peak_flops_fp8_tflops": peak,
        "mem_bandwidth_gbps": bw,
    }


# ---------------------------------
# データ生成
# ---------------------------------
rows = []
ts = datetime.utcnow().isoformat()

for vendor, skus in SKU.items():
    for chip in skus:
        for num in GPU_COUNTS:
            for fw in FRAMEWORKS:
                # TritonはNVIDIA専用
                if fw.get("vendor_only") and fw["vendor_only"] != vendor:
                    continue
                for fam, models in MODEL_FAMILIES.items():
                    for mdl in models:
                        # ランダムで少しノイズ
                        jitter = 1.0 + random.uniform(-0.05, 0.05)

                        m = compute_metrics(vendor, chip, num, fw, mdl)
                        row = {
                            "run_id": str(uuid4())[:8],
                            "timestamp": ts,
                            "vendor": vendor,
                            "chip": chip["chip"],
                            "num_gpus": num,
                            "推論フレームワーク": fw["name"],
                            "model_family": fam,
                            "model_name": mdl["model_name"],
                            "params_total_b": mdl["params_total_b"],
                            "params_active_b": mdl["params_active_b"],
                            "dataset_type": DATASET_TYPE,
                            "input_tokens": INPUT_TOKENS,
                            "concurrency": m["concurrency"],
                            "TTFT_s": m["TTFT_s"] * jitter,
                            "decode_tps_token_s": m["decode_tps_token_s"] * jitter,
                            "e2e_latency_s": m["e2e_latency_s"] * jitter,
                            "system_ott_token_s": m["system_ott_token_s"] * jitter,
                            "rps": m["rps"] * jitter,
                            # 参考（見せてもOKな軽めの基礎情報）
                            "vram_total_gb": m["vram_total_gb"],
                            "peak_flops_fp8_tflops": m["peak_flops_fp8_tflops"],
                            "mem_bandwidth_gbps": m["mem_bandwidth_gbps"],
                        }
                        rows.append(row)

df = pd.DataFrame(rows)


# スコア（Z正規化の合成）
def zscore(series):
    mu = series.mean()
    sd = series.std() if series.std() > 0 else 1.0
    return (series - mu) / sd


df["score"] = 0.5 * zscore(df["system_ott_token_s"]) + 0.5 * zscore(-df["TTFT_s"])

# 列の並び（簡素版）
cols = [
    "run_id",
    "timestamp",
    "vendor",
    "chip",
    "num_gpus",
    "推論フレームワーク",
    "model_family",
    "model_name",
    "params_total_b",
    "params_active_b",
    "dataset_type",
    "input_tokens",
    "concurrency",
    "TTFT_s",
    "decode_tps_token_s",
    "e2e_latency_s",
    "system_ott_token_s",
    "rps",
    "score",
    "vram_total_gb",
    "peak_flops_fp8_tflops",
    "mem_bandwidth_gbps",
]
df = df[cols]

# 保存
df.to_csv(OUTPUT_CSV, index=False)
