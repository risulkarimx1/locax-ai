# M2M100 Integration Plan

## Objective
Add on-device support for Facebook’s `m2m100_418M` translation model so Locax can run it like existing Ollama integrations. Users should be able to download the weights once, run a local inference service, and access it through the current AI provider abstraction without changing UI workflows.

## Deployment Model & Constraints
- **Model assets**: ~1.2 GB PyTorch checkpoint + tokenizer files from Hugging Face (`facebook/m2m100_418M`). Store them under `~/.locax/models/m2m100_418M/` with a manifest describing version, SHA256, and quantization (FP16, optional 8-bit).
- **Runtime**: Prefer PyTorch + `transformers` with optional `bitsandbytes` for 8-bit loading; provide ONNX Runtime fallback for CPU-only installs.
- **Service contract**: Run a lightweight FastAPI server exposing `/translate`, `/health`, `/metadata` so the frontend can treat it like any other LLM provider. Response format should match current translation adapters (text output + token usage).
- **Local-first parity**: Mirror the Ollama UX—list detected local providers, allow manual endpoint override, and cache configuration per workspace.

## Step-by-Step Guide & Ownership
| Step | Owner | Actions |
| --- | --- | --- |
| 1. Approve dependency scope | User | Confirm adding `transformers`, `accelerate`, `bitsandbytes` (optional), `fastapi`, and `uvicorn` to the desktop bundle or a sidecar virtualenv. |
| 2. Create model manifest | Codex | Add `models/m2m100_418M/manifest.json` describing source repo, commit hash, tokenizer IDs, disk size, and compatible language codes. |
| 3. Build download script | Codex | Implement `scripts/m2m100/fetch.py` (Python) that uses `huggingface_hub` to pull weights into `~/.locax/models/…`, verify checksums, and register availability in a `models.json` cache. |
| 4. Ship inference microservice | Codex | Create `server/m2m100_service.py` (FastAPI) that loads the model lazily, exposes `/translate`, handles batching, GPU detection, and forced `bos_token_id` logic. Include config flags for precision, device, and max sequence length. |
| 5. Package service | Codex | Add npm scripts and `server/requirements-m2m100.txt` so the FastAPI runtime can be installed alongside Electron builds; document how to start/stop the service automatically when the desktop app launches. |
| 6. Extend provider registry | Codex | Update the shared provider definitions (likely `src/lib/ai/providers.ts`) so “M2M100 (Local)” appears with fields: task type `translation`, endpoint default `http://127.0.0.1:9600`, supported languages list, and download status. |
| 7. Update UI flows | Codex | In the “Connect AI” modal, add the new provider card with buttons: “Download model” (runs script), “Launch local server”, and “Test connection”. Surface disk/GPU requirements and error states. |
| 8. Add orchestration logic | Codex | Enhance the translation execution path to route requests to the local server when selected, with fallback to hosted models if unavailable. Capture metrics (latency, token counts) in existing logging hooks. |
| 9. QA & performance tuning | User + Codex | User supplies sample localization files and hardware constraints; Codex runs regression tests (compare outputs vs. HF reference, soak test concurrency, confirm CPU-only throughput). Iterate on quantization or ONNX if required. |
| 10. Documentation & release | Codex | Update `README.md` (AI providers section) and add a “Local M2M100 Setup” doc referencing the new scripts. User reviews and signs off on wording + release notes. |

## Additional Notes
- **Storage management**: Add a UI section to delete cached models and reclaim disk space; include checksum validation before each load to detect corruption.
- **Security**: No API keys required, but restrict the FastAPI server to `localhost` and validate that Electron only proxies requests from trusted origins.
- **Future-proofing**: Design manifests so additional HF translation models can be added by dropping new entries without changing the architecture. Use semantic versioning for manifests (for example, `m2m100_418M@1.0.0`).
- **Setup guide**: Contributors should follow `docs/m2m100_local_setup.md` to install Python deps, download weights, and run the FastAPI service before selecting the provider in Locax.
