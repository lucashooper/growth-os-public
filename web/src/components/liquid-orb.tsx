"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  GLASS_LIQUID_SHADER,
  SIRI_WAVE_BASE_SPEED,
  SIRI_WAVE_UNIFORM_SEED,
} from "@/components/liquid-orb-shader";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  mode?: OrbMode;
  audioLevel?: number;
  className?: string;
  size?: "full" | "mini";
};

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapter | null>;
    getPreferredCanvasFormat: () => GPUTextureFormat;
  };
};

type GPUAdapter = {
  requestDevice: () => Promise<GPUDevice>;
};

type GPUDevice = {
  createShaderModule: (desc: { code: string }) => GPUShaderModule;
  createBuffer: (desc: {
    size: number;
    usage: number;
  }) => GPUBuffer;
  createRenderPipeline: (desc: unknown) => GPURenderPipeline;
  createBindGroup: (desc: unknown) => GPUBindGroup;
  createCommandEncoder: () => GPUCommandEncoder;
  queue: GPUQueue;
  destroy: () => void;
  lost: Promise<{ message?: string; reason?: string }>;
  addEventListener: (
    type: "uncapturederror",
    listener: (event: GPUUncapturedErrorEvent) => void,
  ) => void;
};

type GPUShaderModule = {
  getCompilationInfo: () => Promise<{
    messages: Array<{
      type: string;
      lineNum: number;
      linePos: number;
      message: string;
    }>;
  }>;
};

type GPUBuffer = object;
type GPURenderPipeline = { getBindGroupLayout: (index: number) => unknown };
type GPUBindGroup = object;
type GPUCommandEncoder = {
  beginRenderPass: (desc: unknown) => GPURenderPassEncoder;
  finish: () => GPUCommandBuffer;
};
type GPURenderPassEncoder = {
  setPipeline: (pipeline: GPURenderPipeline) => void;
  setBindGroup: (index: number, group: GPUBindGroup) => void;
  draw: (count: number) => void;
  end: () => void;
};
type GPUCommandBuffer = object;
type GPUQueue = {
  writeBuffer: (
    buffer: GPUBuffer,
    offset: number,
    data: ArrayBufferView,
  ) => void;
  submit: (commands: GPUCommandBuffer[]) => void;
};
type GPUUncapturedErrorEvent = Event & {
  error: Error;
  preventDefault: () => void;
};
type GPUTextureFormat = string;

type GPUCanvasContext = {
  configure: (desc: {
    device: GPUDevice;
    format: GPUTextureFormat;
    alphaMode: "premultiplied" | "opaque";
  }) => void;
  getCurrentTexture: () => { createView: () => unknown };
};

const GPU_BUFFER_USAGE_UNIFORM = 0x0040;
const GPU_BUFFER_USAGE_COPY_DST = 0x0008;

function speedMultiplier(mode: OrbMode, audioLevel: number): number {
  const amp = Math.max(0, Math.min(1, audioLevel));
  switch (mode) {
    case "thinking":
      return 1.15;
    case "listening":
      return 0.95 + amp * 0.35;
    case "speaking":
      return 1.05 + amp * 0.4;
    default:
      return 0.55;
  }
}

function canvasEnergy(mode: OrbMode, audioLevel: number): number {
  const amp = Math.max(0, Math.min(1, audioLevel));
  switch (mode) {
    case "thinking":
      return 0.85;
    case "listening":
      return 0.55 + amp * 0.45;
    case "speaking":
      return 0.6 + amp * 0.5;
    default:
      return 0.35;
  }
}

function drawCanvas2DFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  now: number,
  startedAt: number,
  mode: OrbMode,
  audioLevel: number,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = Math.min(canvas.clientWidth || 320, canvas.clientHeight || 320);
  const size = Math.max(1, Math.floor(css * dpr));
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  const t =
    ((now - startedAt) / 1000) * speedMultiplier(mode, audioLevel);
  const amp = Math.max(0, Math.min(1, audioLevel));
  const energy = canvasEnergy(mode, audioLevel);

  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const rad = size * 0.42;

  const glow = ctx.createRadialGradient(cx, cy, rad * 0.7, cx, cy, rad * 1.35);
  glow.addColorStop(0, "rgba(197,169,255,0.12)");
  glow.addColorStop(0.55, "rgba(155,244,255,0.06)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.clip();

  const fill = ctx.createRadialGradient(
    cx - rad * 0.25,
    cy - rad * 0.3,
    rad * 0.1,
    cx,
    cy,
    rad,
  );
  fill.addColorStop(0, "rgba(234,244,255,0.22)");
  fill.addColorStop(0.45, "rgba(40,36,70,0.55)");
  fill.addColorStop(1, "rgba(8,10,22,0.92)");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);

  const bands = [
    { color: "rgba(155,244,255,0.55)", phase: -1.6, sep: 1.0 },
    { color: "rgba(197,169,255,0.7)", phase: -0.45, sep: 0.55 },
    { color: "rgba(255,255,255,0.85)", phase: 0, sep: 0 },
    { color: "rgba(200,160,255,0.65)", phase: 0.45, sep: 0.55 },
    { color: "rgba(120,200,255,0.5)", phase: 1.6, sep: 1.0 },
  ];

  for (const band of bands) {
    ctx.beginPath();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const xNorm = (i / steps) * 2 - 1;
      const envelope = Math.pow(
        Math.cos(1.5708 * Math.min(Math.abs(0.92 * xNorm), 1)),
        2,
      );
      const y =
        (0.22 + energy * 0.12) *
        envelope *
        Math.sin(xNorm * 3.2 + t * 2.4 + band.phase) *
        (1 + amp * 0.35);
      const px = cx + xNorm * rad * 0.92;
      const py = cy + (y + band.sep * 0.04 * energy) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = band.color;
    ctx.lineWidth = (band.sep === 0 ? 3.2 : 2.1) * dpr * (0.7 + energy * 0.5);
    ctx.lineCap = "round";
    ctx.shadowColor = band.color;
    ctx.shadowBlur = 18 * dpr * energy;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const xNorm = (i / 48) * 2 - 1;
    const envelope = Math.pow(
      Math.cos(1.5708 * Math.min(Math.abs(0.9 * xNorm), 1)),
      2,
    );
    const y =
      (0.22 + energy * 0.1) *
      envelope *
      Math.sin(xNorm * 3.4 + t * 2.4);
    const px = cx + xNorm * rad * 0.88;
    const py = cy + y * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2.4 * dpr;
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = 12 * dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.restore();

  const rim = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
  rim.addColorStop(0, "rgba(255,255,255,0.55)");
  rim.addColorStop(0.35, "rgba(155,244,255,0.25)");
  rim.addColorStop(0.7, "rgba(197,169,255,0.2)");
  rim.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.5 * dpr;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(
    cx - rad * 0.28,
    cy - rad * 0.38,
    rad * 0.28,
    rad * 0.14,
    -0.5,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
}

/**
 * Glass Liquid WebGPU orb (Siri Wave + glass shell preset).
 * Falls back silently to a Canvas 2D approximation when WebGPU is unavailable.
 */
export function LiquidOrb({
  mode = "idle",
  audioLevel = 0,
  className,
  size = "full",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const modeRef = useRef(mode);
  const levelRef = useRef(audioLevel);
  const deviceRef = useRef<GPUDevice | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let stopped = false;
    let renderPath: "none" | "webgpu" | "canvas2d" = "none";
    const startedAt = performance.now();

    const cleanupDevice = () => {
      const device = deviceRef.current;
      deviceRef.current = null;
      try {
        device?.destroy();
      } catch {
        /* ignore */
      }
    };

    const stopAll = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      cleanupDevice();
    };

    const startCanvas2D = () => {
      if (stopped || renderPath === "canvas2d") return;
      renderPath = "canvas2d";
      cancelAnimationFrame(rafRef.current);
      cleanupDevice();

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const frame = (now: number) => {
        if (stopped) return;
        try {
          drawCanvas2DFrame(
            canvas,
            ctx,
            now,
            startedAt,
            modeRef.current,
            levelRef.current,
          );
        } catch {
          /* silent */
        }
        rafRef.current = requestAnimationFrame(frame);
      };

      rafRef.current = requestAnimationFrame(frame);
    };

    const startWebGPU = async () => {
      const gpu = (navigator as GpuNavigator).gpu;
      if (!gpu) {
        startCanvas2D();
        return;
      }

      let device: GPUDevice | null = null;

      try {
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error("no adapter");
        device = await adapter.requestDevice();
        deviceRef.current = device;

        const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (!context) throw new Error("no webgpu context");

        const format = gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: "premultiplied" });

        const shader = device.createShaderModule({ code: GLASS_LIQUID_SHADER });
        const compilation = await shader.getCompilationInfo();
        const errors = compilation.messages.filter((m) => m.type === "error");
        if (errors.length) throw new Error("shader compile failed");

        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: shader, entryPoint: "vs_main" },
          fragment: {
            module: shader,
            entryPoint: "fs_main",
            targets: [{ format }],
          },
          primitive: { topology: "triangle-list" },
        });

        const values = new Float32Array(SIRI_WAVE_UNIFORM_SEED);
        const uniformBuffer = device.createBuffer({
          size: values.byteLength,
          usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
        });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        renderPath = "webgpu";

        device.lost.then(() => {
          if (!stopped) startCanvas2D();
        });
        device.addEventListener("uncapturederror", (event) => {
          event.preventDefault();
          if (!stopped) startCanvas2D();
        });

        const frame = (now: number) => {
          if (stopped || renderPath !== "webgpu") return;
          try {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
            const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }

            values[0] = width;
            values[1] = height;
            values[2] = (now - startedAt) / 1000;
            values[3] =
              SIRI_WAVE_BASE_SPEED *
              speedMultiplier(modeRef.current, levelRef.current);

            device!.queue.writeBuffer(uniformBuffer, 0, values);

            const encoder = device!.createCommandEncoder();
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: context.getCurrentTexture().createView(),
                  clearValue: { r: 0, g: 0, b: 0, a: 0 },
                  loadOp: "clear",
                  storeOp: "store",
                },
              ],
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
            device!.queue.submit([encoder.finish()]);
            rafRef.current = requestAnimationFrame(frame);
          } catch {
            startCanvas2D();
          }
        };

        rafRef.current = requestAnimationFrame(frame);
      } catch {
        cleanupDevice();
        startCanvas2D();
      }
    };

    void startWebGPU();

    const onPageHide = () => stopAll();
    window.addEventListener("pagehide", onPageHide, { once: true });

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      stopAll();
    };
  }, []);

  return (
    <div
      className={cn(
        size === "mini"
          ? "relative h-12 w-12 shrink-0"
          : "relative aspect-square w-[min(220px,38vmin)] shrink-0",
        className,
      )}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ background: "transparent" }}
      />
    </div>
  );
}

/** Drop-in alias used by Voice Agent */
export function OrbAgent(props: Props) {
  return <LiquidOrb {...props} />;
}
