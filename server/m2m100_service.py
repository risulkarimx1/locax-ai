#!/usr/bin/env python3
"""
Local inference microservice for facebook/m2m100_418M.

Start with:
    python3 server/m2m100_service.py --model-path ~/.locax/models/m2m100_418M
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import M2M100ForConditionalGeneration

try:
  from transformers import M2M100TokenizerFast as _TokenizerClass
except ImportError:  # pragma: no cover - fallback for older wheels
  from transformers import M2M100Tokenizer as _TokenizerClass


try:  # Optional dependency for 8-bit loading
  from transformers import BitsAndBytesConfig
except Exception:  # pragma: no cover - optional path
  BitsAndBytesConfig = None  # type: ignore


LOGGER = logging.getLogger("m2m100_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


@dataclass
class ServiceConfig:
  model_id: str = "facebook/m2m100_418M"
  model_path: Path = Path.home() / ".locax" / "models" / "m2m100_418M"
  device: Optional[str] = None
  precision: str = "auto"  # auto, float32, float16, int8
  beam_size: int = 4
  max_length: int = 256
  preload: bool = True
  source_language: str = "en"


class TranslatePayload(BaseModel):
  source_text: str = Field(..., min_length=1, description="English or source text to translate")
  target_languages: list[str] = Field(..., min_items=1, description="Language codes supported by M2M100")
  source_language: str | None = Field(default=None, description="Override default source language")
  context: str | None = Field(default=None, description="Optional context string appended to the source text")
  max_length: int | None = Field(default=None, ge=32, le=1024)
  beam_size: int | None = Field(default=None, ge=1, le=8)


class MetadataResponse(BaseModel):
  model_id: str
  device: str
  precision: str
  max_length: int
  beam_size: int


app = FastAPI(title="M2M100 Local Service", version="0.1.0")
SERVICE_CONFIG = ServiceConfig()
_model: Optional[M2M100ForConditionalGeneration] = None
_tokenizer: Optional[_TokenizerClass] = None
_runtime_lock = asyncio.Lock()


def configure_service(config: ServiceConfig) -> None:
  global SERVICE_CONFIG
  SERVICE_CONFIG = config
  LOGGER.info("Runtime configured: %s", SERVICE_CONFIG)


def resolve_device(preferred: Optional[str]) -> str:
  if preferred in {"cpu", "cuda"}:
    return preferred
  return "cuda" if torch.cuda.is_available() else "cpu"


def resolve_dtype(precision: str, device: str) -> torch.dtype:
  if precision == "float32":
    return torch.float32
  if precision == "float16":
    if device == "cpu":
      LOGGER.warning("float16 requested on CPU; falling back to float32.")
      return torch.float32
    return torch.float16
  return torch.float16 if device == "cuda" else torch.float32


def build_quant_config(precision: str):
  if precision != "int8":
    return None
  if BitsAndBytesConfig is None:
    LOGGER.warning("bitsandbytes not installed; falling back to float precision.")
    return None
  return BitsAndBytesConfig(load_in_8bit=True)


async def ensure_runtime_loaded() -> None:
  global _model, _tokenizer
  if _model is not None and _tokenizer is not None:
    return

  async with _runtime_lock:
    if _model is not None and _tokenizer is not None:
      return

    device = resolve_device(SERVICE_CONFIG.device)
    dtype = resolve_dtype(SERVICE_CONFIG.precision, device)
    quant_config = build_quant_config(SERVICE_CONFIG.precision)

    model_kwargs = {
        "torch_dtype": dtype,
    }
    if quant_config is not None:
      model_kwargs["quantization_config"] = quant_config

    LOGGER.info("Loading %s from %s on %s (%s)", SERVICE_CONFIG.model_id, SERVICE_CONFIG.model_path, device, dtype)
    model = M2M100ForConditionalGeneration.from_pretrained(SERVICE_CONFIG.model_path, **model_kwargs)
    tokenizer = _TokenizerClass.from_pretrained(SERVICE_CONFIG.model_path)

    if device == "cuda":
      model.to(device)

    _model = model
    _tokenizer = tokenizer
    LOGGER.info("Model ready. Supported languages: %s", len(tokenizer.lang_code_to_id))


def generate_translation(text: str, lang: str, source_language: str, max_length: int, beam_size: int) -> str:
  if _model is None or _tokenizer is None:
    raise RuntimeError("Model not loaded")

  tokenizer = _tokenizer
  model = _model
  tokenizer.src_lang = source_language

  encoded = tokenizer(text, return_tensors="pt")
  try:
    device = next(model.parameters()).device
  except StopIteration:
    device = torch.device("cpu")
  encoded = {key: value.to(device) for key, value in encoded.items()}
  try:
    forced_bos_token_id = tokenizer.get_lang_id(lang)
  except KeyError as exc:
    raise HTTPException(status_code=400, detail=f"Unsupported language code: {lang}") from exc

  generated_tokens = model.generate(
      **encoded,
      forced_bos_token_id=forced_bos_token_id,
      max_length=max_length,
      num_beams=beam_size,
      no_repeat_ngram_size=3,
  )
  decoded = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)
  return decoded[0].strip()


@app.on_event("startup")
async def _startup_event() -> None:
  if SERVICE_CONFIG.preload:
    await ensure_runtime_loaded()


@app.get("/health")
async def healthcheck() -> Dict[str, str]:
  status = "ready" if _model is not None else "initializing"
  return {"status": status}


@app.get("/metadata", response_model=MetadataResponse)
async def metadata() -> MetadataResponse:
  device = resolve_device(SERVICE_CONFIG.device)
  return MetadataResponse(
      model_id=SERVICE_CONFIG.model_id,
      device=device,
      precision=SERVICE_CONFIG.precision,
      max_length=SERVICE_CONFIG.max_length,
      beam_size=SERVICE_CONFIG.beam_size,
  )


@app.post("/translate")
async def translate(payload: TranslatePayload) -> Dict[str, Dict[str, str]]:
  await ensure_runtime_loaded()

  text = payload.source_text.strip()
  if payload.context:
    text = f"{payload.context.strip()}\n{text}"

  max_length = payload.max_length or SERVICE_CONFIG.max_length
  beam_size = payload.beam_size or SERVICE_CONFIG.beam_size
  source_language = payload.source_language or SERVICE_CONFIG.source_language

  translations: Dict[str, str] = {}
  for lang in payload.target_languages:
    translations[lang] = generate_translation(text, lang, source_language, max_length, beam_size)

  return {"translations": translations}


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Serve facebook/m2m100_418M via FastAPI.")
  parser.add_argument("--model-path", default=str(SERVICE_CONFIG.model_path), help="Path to local model files.")
  parser.add_argument("--model-id", default=SERVICE_CONFIG.model_id, help="Model identifier for metadata.")
  parser.add_argument("--device", choices=["cpu", "cuda"], default=None, help="Force target device (auto-detect by default).")
  parser.add_argument(
      "--precision",
      choices=["auto", "float32", "float16", "int8"],
      default=SERVICE_CONFIG.precision,
      help="Preferred precision; int8 requires bitsandbytes.",
  )
  parser.add_argument("--beam-size", type=int, default=SERVICE_CONFIG.beam_size)
  parser.add_argument("--max-length", type=int, default=SERVICE_CONFIG.max_length)
  parser.add_argument("--host", default="127.0.0.1")
  parser.add_argument("--port", type=int, default=9600)
  parser.add_argument("--no-preload", action="store_true", help="Lazy-load the model on first request.")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  config = ServiceConfig(
      model_id=args.model_id,
      model_path=Path(args.model_path).expanduser().resolve(),
      device=args.device,
      precision=args.precision,
      beam_size=args.beam_size,
      max_length=args.max_length,
      preload=not args.no_preload,
  )
  configure_service(config)

  if not config.model_path.exists():
    raise SystemExit(f"Model path {config.model_path} not found. Run scripts/m2m100/fetch.py first.")

  LOGGER.info("Starting FastAPI on %s:%s", args.host, args.port)
  uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
  main()
