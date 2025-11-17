#!/usr/bin/env python3
"""
Download and register the facebook/m2m100_418M weights for offline use.

Usage:
    python3 scripts/m2m100/fetch.py --help
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import shutil
from typing import Any, Dict, List

try:
  from huggingface_hub import snapshot_download
except ImportError as exc:  # pragma: no cover - import guard
  raise SystemExit(
      "huggingface_hub is required. Install deps via `pip install -r server/requirements-m2m100.txt`."
  ) from exc


DEFAULT_MODEL_ID = "facebook/m2m100_418M"
DEFAULT_TARGET = Path.home() / ".locax" / "models" / "m2m100_418M"
REGISTRY_PATH = Path.home() / ".locax" / "models" / "registry.json"


def sha256sum(file_path: Path) -> str:
  hasher = hashlib.sha256()
  with file_path.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
      hasher.update(chunk)
  return hasher.hexdigest()


def build_manifest(target_dir: Path, model_id: str, revision: str, precision: str) -> Dict[str, Any]:
  artifacts: List[Dict[str, Any]] = []
  for file_path in sorted(target_dir.rglob("*")):
    if file_path.is_file():
      rel_path = file_path.relative_to(target_dir)
      artifacts.append(
          {
              "path": str(rel_path),
              "size_bytes": file_path.stat().st_size,
              "sha256": sha256sum(file_path),
          }
      )

  return {
      "model_id": model_id,
      "revision": revision,
      "precision": precision,
      "downloaded_at": datetime.now(timezone.utc).isoformat(),
      "artifacts": artifacts,
  }


def persist_registry_entry(target_dir: Path, manifest: Dict[str, Any]) -> None:
  registry_path = REGISTRY_PATH.expanduser()
  registry_path.parent.mkdir(parents=True, exist_ok=True)
  if registry_path.exists():
    with registry_path.open("r", encoding="utf-8") as handle:
      try:
        data = json.load(handle)
      except json.JSONDecodeError:
        data = {}
  else:
    data = {}

  data[manifest["model_id"]] = {
      "path": str(target_dir),
      "revision": manifest["revision"],
      "precision": manifest["precision"],
      "downloaded_at": manifest["downloaded_at"],
  }

  with registry_path.open("w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Download facebook/m2m100_418M locally for offline inference.")
  parser.add_argument("--model-id", default=DEFAULT_MODEL_ID, help="Hugging Face repository ID.")
  parser.add_argument("--revision", default="main", help="Git revision or tag to download.")
  parser.add_argument(
      "--target-dir",
      default=str(DEFAULT_TARGET),
      help=f"Destination folder (default: {DEFAULT_TARGET})",
  )
  parser.add_argument(
      "--precision",
      choices=["float16", "float32", "int8"],
      default="float16",
      help="Recorded precision preference. Actual quantization happens when the service loads the model.",
  )
  parser.add_argument(
      "--token",
      default=os.getenv("HF_TOKEN"),
      help="Optional Hugging Face token for higher rate limits (also reads HF_TOKEN env).",
  )
  parser.add_argument(
      "--clean",
      action="store_true",
      help="Remove existing files in the target directory before downloading.",
  )
  parser.add_argument(
      "--max-workers",
      type=int,
      default=5,
      help="Max concurrent downloads passed to huggingface_hub.",
  )
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  target_dir = Path(args.target_dir).expanduser().resolve()

  if args.clean and target_dir.exists():
    print(f"🧹 Removing existing files in {target_dir}")
    shutil.rmtree(target_dir)

  target_dir.mkdir(parents=True, exist_ok=True)

  print(f"⬇️  Downloading {args.model_id}@{args.revision} to {target_dir}")
  snapshot_download(
      repo_id=args.model_id,
      revision=args.revision,
      local_dir=target_dir,
      local_dir_use_symlinks=False,
      resume_download=True,
      token=args.token,
      max_workers=args.max_workers,
  )
  manifest = build_manifest(target_dir, args.model_id, args.revision, args.precision)
  manifest_path = target_dir / "manifest-lock.json"
  with manifest_path.open("w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2)

  persist_registry_entry(target_dir, manifest)
  print(f"✅ Download complete. Manifest saved to {manifest_path}")


if __name__ == "__main__":
  main()
