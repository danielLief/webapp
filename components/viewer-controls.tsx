'use client'

import { Trash2, RotateCcw } from "lucide-react";

const SCALE_MIN = 0.2;
const SCALE_MAX = 3;
const SCALE_STEP = 0.05;

interface ViewerControlsProps {
  onClear: () => void;
  onResetCamera: () => void;
  onRotate: (axis: "x" | "y" | "z") => void;
  scale: number;
  onScaleChange: (value: number) => void;
}

export function ViewerControls({
  onClear,
  onResetCamera,
  onRotate,
  scale,
  onScaleChange,
}: ViewerControlsProps) {
  const scalePercent = ((scale - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  return (
    <div className="space-y-3">
      <button
        onClick={onResetCamera}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 rounded-md transition-colors duration-200 font-mono text-xs text-foreground/80 hover:text-foreground"
      >
        <RotateCcw size={14} />
        Reset View
      </button>

      <div className="grid grid-cols-3 gap-2">
        {(["x", "y", "z"] as const).map((axis) => (
          <button
            key={axis}
            onClick={() => onRotate(axis)}
            className="px-3 py-2 border border-foreground/20 bg-foreground/5 hover:bg-foreground/10 rounded-md font-mono text-[10px] uppercase text-foreground/70 hover:text-foreground transition-colors duration-200"
          >
            Rotate {axis.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="space-y-3 border border-foreground/10 rounded-md p-3">
        <div className="flex items-center justify-between text-[10px] font-mono text-foreground/60 uppercase tracking-[0.2em]">
          <span>Scale</span>
          <span>{scale.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          value={scale}
          onChange={(event) => onScaleChange(parseFloat(event.target.value))}
          className="w-full h-1 bg-transparent appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(255,255,255,0.5)] [&::-webkit-slider-thumb]:transition-colors [&::-webkit-slider-thumb]:duration-200 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_5px_rgba(255,255,255,0.5)] [&::-moz-range-track]:bg-transparent"
          style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0.9) ${scalePercent}%, rgba(255,255,255,0.1) ${scalePercent}%)`,
          }}
        />
      </div>

      <button
        onClick={onClear}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-md transition-colors duration-200 font-mono text-xs text-red-400 hover:text-red-300"
      >
        <Trash2 size={14} />
        Clear Model
      </button>
    </div>
  );
}
