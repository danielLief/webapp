'use client'

import { Canvas } from "@react-three/fiber";
import { useState, useRef } from "react";
import type { PerspectiveCamera } from "three";
import { ModelScene } from "./model-scene";
import { ViewerControls } from "./viewer-controls";
import { Upload } from "lucide-react";

interface ControlsApi {
  reset: () => void;
}

export function ModelViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string>("");
  const [modelExtension, setModelExtension] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsApiRef = useRef<ControlsApi | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (modelUrl) {
        URL.revokeObjectURL(modelUrl);
      }
      const url = URL.createObjectURL(file);
      setModelUrl(url);
      setModelName(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? null;
      setModelExtension(ext);
    }
  };

  const handleClear = () => {
    if (modelUrl) {
      URL.revokeObjectURL(modelUrl);
    }
    setModelUrl(null);
    setModelName("");
    setModelExtension(null);
    controlsApiRef.current?.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleResetCamera = () => {
    controlsApiRef.current?.reset();
  };

  return (
    <div className="w-full h-svh flex flex-col">
      {/* 3D Canvas */}
      <div id="webgl" className="flex-1 relative">
        <Canvas
          camera={{
            position: [5, 5, 5],
            fov: 50,
            near: 0.01,
            far: 300,
          }}
        >
          <color attach="background" args={["#000"]} />
          <ModelScene
            modelUrl={modelUrl}
            modelExtension={modelExtension}
            cameraRef={cameraRef}
            onControlsReady={(api) => {
              controlsApiRef.current = api;
            }}
            onLoadingChange={setIsLoading}
          />
        </Canvas>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm transition-opacity text-foreground/80 font-mono text-xs uppercase tracking-[0.3em]">
            <div className="flex items-center gap-3">
              <span>Loading model</span>
              <div className="flex items-center gap-1">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.15s" }}>
                  .
                </span>
                <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>
                  .
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="fixed bottom-8 left-8 right-8 md:right-auto md:w-80 z-40 bg-background/80 backdrop-blur-md border border-border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-mono text-sm font-semibold text-foreground/100 mb-3 uppercase tracking-wide">
            Model Viewer
          </h3>
          <p className="font-mono text-xs text-foreground/40 mb-4">
            {modelName ? `Loaded: ${modelName}` : "No model loaded"}
          </p>
        </div>

        {/* Upload Area */}
        {!modelUrl && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative group cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".gltf,.glb,.obj,.fbx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-white/30 rounded-md hover:border-white/60 transition-colors duration-300 group-hover:bg-white/5">
              <Upload size={16} className="text-white" />
              <span className="font-mono text-xs text-foreground/60 group-hover:text-foreground/80 transition-colors">
                Click to upload
              </span>
            </div>
          </div>
        )}

        {/* Controls */}
        {modelUrl && (
          <ViewerControls
            onClear={handleClear}
            onResetCamera={handleResetCamera}
          />
        )}

        {/* Info */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="font-mono text-xs text-foreground/40 leading-relaxed">
            Supported formats: GLTF, GLB, OBJ, FBX
          </p>
          <p className="font-mono text-xs text-foreground/40 leading-relaxed">
            Controls: WASD to move • Space to rise • Shift to descend • Hold left-click and drag to look around
          </p>
        </div>
      </div>
    </div>
  );
}
