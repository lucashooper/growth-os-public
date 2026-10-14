import json
import ast
import sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit("Usage: python extract-orb-shader.py path/to/transcript.jsonl")
path = Path(sys.argv[1])
out_dir = Path(__file__).resolve().parent.parent / "src" / "components"

with path.open("r", encoding="utf-8") as f:
    text = json.loads(f.readline())["message"]["content"][0]["text"]

# Extract shaderSource = "..." with JS string escapes
shader_key = "shaderSource = "
si = text.find(shader_key)
if si < 0:
    raise SystemExit("shaderSource not found")
si += len(shader_key)
if text[si] != '"':
    raise SystemExit(f"expected quote at {si}, got {repr(text[si:si+20])}")

i = si + 1
chars = []
while i < len(text):
    c = text[i]
    if c == "\\":
        n = text[i + 1]
        if n == "n":
            chars.append("\n")
            i += 2
        elif n == "t":
            chars.append("\t")
            i += 2
        elif n == "r":
            chars.append("\r")
            i += 2
        elif n == '"':
            chars.append('"')
            i += 2
        elif n == "\\":
            chars.append("\\")
            i += 2
        else:
            chars.append(n)
            i += 2
    elif c == '"':
        break
    else:
        chars.append(c)
        i += 1

shader = "".join(chars)
print("shader length:", len(shader))
(out_dir / "_shader_extract.wgsl").write_text(shader, encoding="utf-8")

# Extract uniformSeed array until ];
seed_key = "uniformSeed = "
sj = text.find(seed_key)
if sj < 0:
    raise SystemExit("uniformSeed not found")
sj += len(seed_key)
if text[sj] != "[":
    raise SystemExit("expected [ for uniformSeed")
depth = 0
j = sj
while j < len(text):
    if text[j] == "[":
        depth += 1
    elif text[j] == "]":
        depth -= 1
        if depth == 0:
            j += 1
            break
    j += 1
seed_str = text[sj:j]
seed = ast.literal_eval(seed_str)
print("seed count:", len(seed))
(out_dir / "_seed_extract.json").write_text(json.dumps(seed), encoding="utf-8")

# Extract init code around WebGPU setup
for marker in [
    "async function initWebGPU",
    "function initWebGPU",
    "getContext(\"webgpu\")",
    "createShaderModule",
    "requestAnimationFrame",
]:
    mi = text.find(marker)
    if mi >= 0:
        print(f"found {marker} at {mi}")

# Save a chunk of HTML JS for WebGPU init
wgpu_idx = text.find('getContext("webgpu")')
if wgpu_idx < 0:
    wgpu_idx = text.find("getContext('webgpu')")
if wgpu_idx >= 0:
    chunk = text[max(0, wgpu_idx - 4000) : wgpu_idx + 12000]
    (out_dir / "_webgpu_init_extract.txt").write_text(chunk, encoding="utf-8")
    print("webgpu init chunk saved")
