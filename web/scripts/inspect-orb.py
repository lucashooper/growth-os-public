import json
import sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit("Usage: python inspect-orb.py path/to/transcript.jsonl")
path = Path(sys.argv[1])
with path.open("r", encoding="utf-8") as f:
    text = json.loads(f.readline())["message"]["content"][0]["text"]

idx = text.find("shaderSource")
print(repr(text[idx : idx + 300]))

idx2 = text.find("uniformSeed")
print("--- uniformSeed ---")
print(repr(text[idx2 : idx2 + 400]))
