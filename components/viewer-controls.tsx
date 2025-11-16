'use client'

import { Trash2, RotateCcw } from "lucide-react";

interface ViewerControlsProps {
  onClear: () => void;
  onResetCamera: () => void;
  onRotate: (axis: "x" | "y" | "z") => void;
}

export function ViewerControls({
  onClear,
  onResetCamera,
  onRotate,
}: ViewerControlsProps) {
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
