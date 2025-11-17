# Local M2M100 Setup

## Requirements
- Python 3.10+
- Access to `facebook/m2m100_418M` on Hugging Face (set `HF_TOKEN` if needed)
- Disk space: ~1.6 GB for weights + tokenizer
- Optional GPU with ≥16 GB VRAM for float16 inference

Install the service dependencies:

```bash
python3 -m venv .venv-m2m100
source .venv-m2m100/bin/activate
pip install -r server/requirements-m2m100.txt
```

## Download weights

```bash
python scripts/m2m100/fetch.py \
  --model-id facebook/m2m100_418M \
  --target-dir ~/.locax/models/m2m100_418M
```

The script mirrors the Hugging Face snapshot, writes `manifest-lock.json`, and updates `~/.locax/models/registry.json`. Re-run with `--clean` to force a fresh download.

## Run the inference server

```bash
python server/m2m100_service.py \
  --model-path ~/.locax/models/m2m100_418M \
  --port 9600 \
  --precision float16
```

Flags:
- `--device cuda` to pin a GPU, otherwise the script auto-detects.
- `--precision int8` enables bitsandbytes loading when installed.
- `--no-preload` defers model loading until the first request.

The FastAPI server exposes:
- `GET /health` – readiness probe
- `GET /metadata` – returns device, precision, and beam size
- `POST /translate` – accepts `{ "source_text": "...", "target_languages": ["es","ja"], "context": "optional" }`

## Connect Locax
1. In Locax → **Connect AI**.
2. Choose **M2M100 (Local)**.
3. Keep the default endpoint `http://127.0.0.1:9600` or point to another machine.
4. Save. No API key is required.

During translation Locax will send the English string, selected language codes, and optional context to the local service. If the call fails, verify the server log and ensure the weights exist under `~/.locax/models/m2m100_418M`.
