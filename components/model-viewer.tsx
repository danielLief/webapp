'use client'

import { Canvas } from "@react-three/fiber";
import { useState, useRef, useEffect } from "react";
import type { PerspectiveCamera } from "three";
import { ModelScene } from "./model-scene";
import { ViewerControls } from "./viewer-controls";
import { Upload } from "lucide-react";

interface ControlsApi {
  reset: () => void;
  rotate?: (axis: "x" | "y" | "z") => void;
}

type AssetMap = Record<string, string>;
type PointCloudData =
  | {
      kind: "bin";
      hasHeaderCount: boolean;
      buffer: ArrayBuffer;
    }
  | {
      kind: "las";
      buffer: ArrayBuffer;
    }
  | {
      kind: "pci";
      file: File;
    };

type PoseData = {
  url: string;
};

type PoseLocationsData = {
  url: string;
};

const SUPPORTED_MODEL_EXTENSIONS = [
  "glb",
  "gltf",
  "fbx",
  "obj",
  "bin",
  "las",
  "pci",
  "pf",
  "plf",
];

const normalizeName = (name: string) => {
  const cleaned = name.trim().replace(/^["']|["']$/g, "").split(/[?#]/)[0];
  const normalized = cleaned.toLowerCase().replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
};

export function ModelViewer() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string>("");
  const [modelExtension, setModelExtension] = useState<string | null>(null);
  const [assetMap, setAssetMap] = useState<AssetMap>({});
  const [pointCloud, setPointCloud] = useState<PointCloudData | null>(null);
  const [poseData, setPoseData] = useState<PoseData | null>(null);
  const [poseLocations, setPoseLocations] = useState<PoseLocationsData | null>(null);
  const [scale, setScale] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsApiRef = useRef<ControlsApi | null>(null);
  const assetUrlsRef = useRef<string[]>([]);

  const cleanupAssets = () => {
    assetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    assetUrlsRef.current = [];
    setAssetMap({});
    setPointCloud(null);
    setPoseData(null);
    setPoseLocations(null);
    setScale(1);
  };

  useEffect(() => {
    return () => {
      cleanupAssets();
    };
  }, []);

  const fileToBuffer = async (file: File) => {
    try {
      return await file.arrayBuffer();
    } catch (error) {
      console.warn("[upload] file.arrayBuffer() failed, trying Response fallback.", error);
    }

    try {
      return await new Response(file).arrayBuffer();
    } catch (error) {
      console.warn("[upload] Response(file).arrayBuffer() failed, trying FileReader fallback.", error);
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () =>
        reject(reader.error ?? new Error("Failed to read file contents via FileReader."));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    cleanupAssets();

    const nextAssetMap: AssetMap = {};
    let primaryFile: File | null = null;

    for (const file of selectedFiles) {
      const url = URL.createObjectURL(file);
      assetUrlsRef.current.push(url);
      nextAssetMap[normalizeName(file.name)] = url;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "obj") {
        primaryFile = file;
      } else if (!primaryFile && SUPPORTED_MODEL_EXTENSIONS.includes(ext)) {
        primaryFile = file;
      }
    }

    if (!primaryFile) {
      primaryFile = selectedFiles[0];
    }

    const primaryExt = primaryFile.name.split(".").pop()?.toLowerCase() ?? null;
    const primaryUrl = nextAssetMap[normalizeName(primaryFile.name)];

    setAssetMap(nextAssetMap);
    setModelUrl(primaryUrl ?? null);
    setModelName(primaryFile.name);
    setModelExtension(primaryExt);
    setScale(1);
    if (primaryExt === "bin" && primaryUrl) {
      const size = primaryFile.size;
      const buffer = await fileToBuffer(primaryFile);
      setPointCloud({
        kind: "bin",
        hasHeaderCount: size >= 4,
        buffer,
      });
      setPoseData(null);
      setPoseLocations(null);
    } else if (primaryExt === "las" && primaryUrl) {
      const buffer = await fileToBuffer(primaryFile);
      setPointCloud({
        kind: "las",
        buffer,
      });
      setPoseData(null);
      setPoseLocations(null);
    } else if (primaryExt === "pci" && primaryUrl) {
      setPointCloud({
        kind: "pci",
        file: primaryFile,
      });
      setPoseData(null);
      setPoseLocations(null);
    } else if (primaryExt === "pf" && primaryUrl) {
      setPointCloud(null);
      setPoseLocations(null);
      setPoseData({
        url: primaryUrl,
      });
    } else if (primaryExt === "plf" && primaryUrl) {
      setPointCloud(null);
      setPoseData(null);
      setPoseLocations({
        url: primaryUrl,
      });
    } else {
      setPointCloud(null);
      setPoseData(null);
      setPoseLocations(null);
    }
  };

  const handleClear = () => {
    cleanupAssets();
    setModelUrl(null);
    setModelName("");
    setModelExtension(null);
    setScale(1);
    controlsApiRef.current?.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleResetCamera = () => {
    controlsApiRef.current?.reset();
  };

  const handleRotate = (axis: "x" | "y" | "z") => {
    controlsApiRef.current?.rotate?.(axis);
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
            modelName={modelName}
            assetMap={assetMap}
            pointCloud={pointCloud}
            poseData={poseData}
            poseLocations={poseLocations}
            scaleMultiplier={scale}
            onRotateRequest={(axis) => {
              controlsApiRef.current?.rotate?.(axis);
            }}
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
          <p className="font-mono text-xs text-foreground/40 mb-4 truncate">
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
              accept=".gltf,.glb,.obj,.fbx,.mtl,.png,.jpg,.jpeg,.webp,.bin,.las,.pci,.pf,.plf"
              multiple
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
            onRotate={handleRotate}
            scale={scale}
            onScaleChange={setScale}
          />
        )}

        {/* Info */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="font-mono text-xs text-foreground/40 leading-relaxed">
            Supported formats: Raw Mesh (OBJ), Textured Mesh (OBJ + MTL + PNG), Point Cloud (BIN, LAS, PCI), Pose File (PF), Pose Locations (PLF)
          </p>
          <p className="font-mono text-xs text-foreground/40 leading-relaxed">
            Controls: WASD to move • Space to rise • Shift to descend • Hold left-click and drag to look around
          </p>
        </div>
      </div>
    </div>
  );
}
