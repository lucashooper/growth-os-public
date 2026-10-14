"""Generate liquid-orb-shader.ts from extracted WGSL + seed."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "src" / "components"
shader = (root / "_shader_extract.wgsl").read_text(encoding="utf-8")
seed = json.loads((root / "_seed_extract.json").read_text(encoding="utf-8"))

out = root / "liquid-orb-shader.ts"
lines = [
    "// Auto-generated Glass Liquid WGSL + Siri Wave / Glass Shell preset seed.",
    "// Source: Glass Liquid WebGPU orb HTML embed.",
    "",
    "export const GLASS_LIQUID_SHADER = `" + shader.replace("`", "\\`") + "`;",
    "",
    "/** Float32 uniform buffer seed — Siri Wave (style 9) + glass shell enabled. */",
    f"export const SIRI_WAVE_UNIFORM_SEED: number[] = {json.dumps(seed)};",
    "",
    "/** Base animation speed from the preset (uniform index 3). */",
    f"export const SIRI_WAVE_BASE_SPEED = {seed[3]} as const;",
    "",
]
out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size} bytes)")
