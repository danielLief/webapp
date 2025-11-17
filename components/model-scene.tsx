'use client'

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";

interface ControlsApi {
  reset: () => void;
}

type AssetMap = Record<string, string>;

interface ModelSceneProps {
  modelUrl: string | null;
  modelExtension: string | null;
  modelName: string;
  assetMap?: AssetMap;
  pointCloud?:
    | {
        kind: "bin";
        url: string;
        hasHeaderCount: boolean;
      }
    | {
        kind: "las";
        url: string;
      }
    | null;
  poseData?: {
    url: string;
  } | null;
  poseLocations?: {
    url: string;
  } | null;
  onRotateRequest?: (axis: "x" | "y" | "z") => void;
  cameraRef?: MutableRefObject<THREE.PerspectiveCamera | null>;
  onControlsReady?: (api: ControlsApi | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  scaleMultiplier?: number;
}

const PITCH_LIMIT = Math.PI / 2 - 0.05;
const MOVE_SPEED = 4;
const ACCELERATION = 14;
const DECELERATION = 10;
const LOOK_SENSITIVITY = 0.003;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ROTATION_DEGREES = 90;
const ROTATION_RADIANS = THREE.MathUtils.degToRad(ROTATION_DEGREES);
const ZOOM_SPEED = 0.002;
const MIN_ZOOM_DISTANCE = 0.5;
const MAX_ZOOM_DISTANCE = 800;

const normalizeAssetKey = (value: string) => {
  const cleaned = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(/[?#]/)[0]
    .toLowerCase()
    .replace(/\\/g, "/");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] || cleaned;
};

const resolveAssetUrl = (assetMap: AssetMap | undefined, name?: string | null) => {
  if (!assetMap || !name) return null;
  return assetMap[normalizeAssetKey(name)] ?? null;
};

const findMtlUrl = (assetMap: AssetMap | undefined, modelName: string) => {
  if (!assetMap) return null;
  const base = modelName.toLowerCase().replace(/\.[^/.]+$/, "");
  const preferred = resolveAssetUrl(assetMap, `${base}.mtl`);
  if (preferred) return preferred;
  const entry = Object.entries(assetMap).find(([key]) => key.endsWith(".mtl"));
  return entry ? entry[1] : null;
};

const createLoadingManager = (assetMap: AssetMap | undefined) => {
  if (!assetMap || Object.keys(assetMap).length === 0) return undefined;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:")) return url;
    const resolved = resolveAssetUrl(assetMap, url);
    return resolved ?? url;
  });
  return manager;
};

const MAX_POINTS = 5000000;
const MAX_POSES = 3000;
const MAX_POSE_LOC_POINTS = 250000;
const MAX_POINT_MAGNITUDE = 1e7;

interface ParsedPointCloud {
  positions: Float32Array;
  colors?: Float32Array;
  metadata: {
    headerOffset: number;
    declaredCount: number | null;
    recordCount: number;
    downsampleStep: number;
    probeFloatHits: number;
    probeIntHits: number;
    usedIntegerMode: boolean;
    acceptedPoints: number;
  };
}

const parsePointCloud = (
  buffer: ArrayBuffer,
  hasHeaderCount: boolean
): ParsedPointCloud | null => {
  const view = new DataView(buffer);
  const stride = 24;
  const totalBytes = buffer.byteLength;

  let headerOffset = 0;
  let declaredCount: number | null = null;

  if (hasHeaderCount && totalBytes >= 4) {
    const candidate = view.getUint32(0, true);
    const expectedBytes = 4 + candidate * stride;
    if (
      candidate > 0 &&
      expectedBytes <= totalBytes &&
      Math.abs(expectedBytes - totalBytes) < stride
    ) {
      headerOffset = 4;
      declaredCount = candidate;
    }
  }

  const availableBytes = totalBytes - headerOffset;
  if (availableBytes < stride) return null;

  const maxPossible = Math.floor(availableBytes / stride);
  if (maxPossible <= 0) return null;

  const recordCount = declaredCount
    ? Math.min(declaredCount, maxPossible)
    : maxPossible;

  const step = Math.max(1, Math.floor(recordCount / MAX_POINTS));
  const sampledCount = Math.max(1, Math.floor(recordCount / step));

  const probeSamples = Math.min(1000, recordCount);
  const probeStride = Math.max(1, Math.floor(recordCount / probeSamples));
  let floatValid = 0;
  let intValid = 0;
  let probeIterations = 0;

  for (let i = 0; i < recordCount && probeIterations < probeSamples; i += probeStride) {
    const base = headerOffset + i * stride;
    const xf = view.getFloat32(base, true);
    const yf = view.getFloat32(base + 4, true);
    const zf = view.getFloat32(base + 8, true);
    const xi = view.getInt32(base, true) / 1000;
    const yi = view.getInt32(base + 4, true) / 1000;
    const zi = view.getInt32(base + 8, true) / 1000;
    probeIterations++;

    const validFloat =
      Number.isFinite(xf) &&
      Number.isFinite(yf) &&
      Number.isFinite(zf) &&
      Math.abs(xf) <= MAX_POINT_MAGNITUDE &&
      Math.abs(yf) <= MAX_POINT_MAGNITUDE &&
      Math.abs(zf) <= MAX_POINT_MAGNITUDE;

    const validInt =
      Number.isFinite(xi) &&
      Number.isFinite(yi) &&
      Number.isFinite(zi) &&
      Math.abs(xi) <= MAX_POINT_MAGNITUDE &&
      Math.abs(yi) <= MAX_POINT_MAGNITUDE &&
      Math.abs(zi) <= MAX_POINT_MAGNITUDE;

    if (validFloat) floatValid++;
    if (validInt) intValid++;
  }

  const useInt = intValid > floatValid;
  const positions = new Float32Array(sampledCount * 3);
  let writeIndex = 0;

  for (let i = 0; i < recordCount; i += step) {
    const base = headerOffset + i * stride;
    const xRaw = useInt ? view.getInt32(base, true) : view.getFloat32(base, true);
    const yRaw = useInt ? view.getInt32(base + 4, true) : view.getFloat32(base + 4, true);
    const zRaw = useInt ? view.getInt32(base + 8, true) : view.getFloat32(base + 8, true);

    const x = useInt ? xRaw / 1000 : xRaw;
    const y = useInt ? yRaw / 1000 : yRaw;
    const z = useInt ? zRaw / 1000 : zRaw;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      Math.abs(x) > MAX_POINT_MAGNITUDE ||
      Math.abs(y) > MAX_POINT_MAGNITUDE ||
      Math.abs(z) > MAX_POINT_MAGNITUDE
    ) {
      continue;
    }

    positions[writeIndex * 3 + 0] = x;
    positions[writeIndex * 3 + 1] = y;
    positions[writeIndex * 3 + 2] = z;
    writeIndex++;
    if (writeIndex >= sampledCount) break;
  }

  if (writeIndex === 0) return null;

  return {
    positions: writeIndex === sampledCount ? positions : positions.slice(0, writeIndex * 3),
    metadata: {
      headerOffset,
      declaredCount,
      recordCount,
      downsampleStep: step,
      probeFloatHits: floatValid,
      probeIntHits: intValid,
      usedIntegerMode: useInt,
      acceptedPoints: writeIndex,
    },
  };
};

const parseLasPointCloud = (buffer: ArrayBuffer): ParsedPointCloud | null => {
  if (buffer.byteLength < 227) return null;
  const view = new DataView(buffer);
  const signature = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
  if (signature !== "LASF") return null;

  const stride = view.getUint16(105, true);
  const pointFormat = view.getUint8(104) & 0x0f;
  const offsetToData = view.getUint32(96, true);
  if (!stride || buffer.byteLength < offsetToData + stride) return null;

  let pointCount = view.getUint32(107, true);
  const viewWith64 = view as DataView & {
    getBigUint64?: (byteOffset: number, littleEndian?: boolean) => bigint;
  };
  if (
    pointCount === 0 &&
    typeof viewWith64.getBigUint64 === "function" &&
    buffer.byteLength >= 255
  ) {
    const extended = Number(viewWith64.getBigUint64(247, true));
    if (Number.isFinite(extended) && extended > 0) {
      pointCount = extended;
    }
  }

  if (pointCount <= 0) return null;

  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);

  const availableRecords = Math.floor((buffer.byteLength - offsetToData) / stride);
  const totalRecords = Math.min(pointCount, availableRecords);
  if (totalRecords <= 0) return null;

  const step = Math.max(1, Math.floor(totalRecords / MAX_POINTS));
  const sampledCount = Math.max(1, Math.floor(totalRecords / step));
  const positions = new Float32Array(sampledCount * 3);
  const hasColor = pointFormat === 2 || pointFormat === 3;
  const colors = hasColor ? new Float32Array(sampledCount * 3) : undefined;

  const colorOffset = pointFormat === 3 ? 28 : 20;
  const colorNorm = 1 / 65535;
  let writeIndex = 0;

  for (let i = 0; i < totalRecords; i += step) {
    const base = offsetToData + i * stride;
    if (base + 12 > buffer.byteLength) break;
    const xi = view.getInt32(base, true);
    const yi = view.getInt32(base + 4, true);
    const zi = view.getInt32(base + 8, true);
    const x = xi * scaleX + offsetX;
    const y = yi * scaleY + offsetY;
    const z = zi * scaleZ + offsetZ;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      Math.abs(x) > MAX_POINT_MAGNITUDE ||
      Math.abs(y) > MAX_POINT_MAGNITUDE ||
      Math.abs(z) > MAX_POINT_MAGNITUDE
    ) {
      continue;
    }

    positions[writeIndex * 3 + 0] = x;
    positions[writeIndex * 3 + 1] = y;
    positions[writeIndex * 3 + 2] = z;

    if (colors && base + colorOffset + 6 <= buffer.byteLength) {
      const red = view.getUint16(base + colorOffset, true) * colorNorm;
      const green = view.getUint16(base + colorOffset + 2, true) * colorNorm;
      const blue = view.getUint16(base + colorOffset + 4, true) * colorNorm;
      colors[writeIndex * 3 + 0] = Math.min(1, red);
      colors[writeIndex * 3 + 1] = Math.min(1, green);
      colors[writeIndex * 3 + 2] = Math.min(1, blue);
    }

    writeIndex++;
    if (writeIndex >= sampledCount) break;
  }

  if (writeIndex === 0) return null;

  return {
    positions: writeIndex === sampledCount ? positions : positions.slice(0, writeIndex * 3),
    colors: colors
      ? writeIndex === sampledCount
        ? colors
        : colors.slice(0, writeIndex * 3)
      : undefined,
    metadata: {
      headerOffset: offsetToData,
      declaredCount: pointCount,
      recordCount: totalRecords,
      downsampleStep: step,
      probeFloatHits: 0,
      probeIntHits: 0,
      usedIntegerMode: false,
      acceptedPoints: writeIndex,
    },
  };
};

const buildPoseGroup = (data: string | ArrayBuffer) => {
  let records: number[][] = [];
  if (typeof data === "string") {
    const tokens = data
      .trim()
      .split(/\s+/)
      .map((val) => parseFloat(val));
    if (tokens.length < 13) return null;
    const total = Math.floor(tokens.length / 13);
    for (let i = 0; i < total; i++) {
      records.push(tokens.slice(i * 13, i * 13 + 13));
    }
  } else {
    const view = new DataView(data);
    const strideBytes = 13 * 4;
    if (view.byteLength < strideBytes) return null;
    const total = Math.floor(view.byteLength / strideBytes);
    if (!Number.isFinite(total) || total <= 0) return null;
    for (let i = 0; i < total; i++) {
      const base = i * strideBytes;
      const record: number[] = [];
      for (let j = 0; j < 13; j++) {
        record.push(view.getFloat32(base + j * 4, true));
      }
      records.push(record);
    }
  }

  if (records.length === 0) return null;
  const step = Math.max(1, Math.floor(records.length / MAX_POSES));
  const group = new THREE.Group();
  for (let i = 0; i < records.length; i += step) {
    const matrixValues = records[i].slice(1, 13);
    const matrix = new THREE.Matrix4();
    matrix.set(
      matrixValues[0],
      matrixValues[1],
      matrixValues[2],
      matrixValues[3],
      matrixValues[4],
      matrixValues[5],
      matrixValues[6],
      matrixValues[7],
      matrixValues[8],
      matrixValues[9],
      matrixValues[10],
      matrixValues[11],
      0,
      0,
      0,
      1
    );
    const axes = new THREE.AxesHelper(0.4);
    axes.applyMatrix4(matrix);
    group.add(axes);
  }
  return group;
};

const buildPoseLocations = (text: string) => {
  const tokens = text
    .trim()
    .split(/\s+/)
    .map((val) => parseFloat(val));
  if (tokens.length < 4) return null;
  const total = Math.floor(tokens.length / 4);
  if (!Number.isFinite(total) || total <= 0) return null;
  const step = Math.max(1, Math.floor(total / MAX_POSE_LOC_POINTS));
  const sampledCount = Math.max(1, Math.floor(total / step));
  const positions = new Float32Array(sampledCount * 3);
  let writeIndex = 0;
  for (let i = 0; i < total; i += step) {
    const base = i * 4;
    const x = tokens[base];
    const y = tokens[base + 1];
    const z = tokens[base + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    positions[writeIndex * 3 + 0] = x;
    positions[writeIndex * 3 + 1] = y;
    positions[writeIndex * 3 + 2] = z;
    writeIndex++;
    if (writeIndex >= sampledCount) break;
  }
  return positions;
};

export function ModelScene({
  modelUrl,
  modelExtension,
  modelName,
  assetMap,
  pointCloud,
  poseData,
  poseLocations,
  onRotateRequest,
  cameraRef,
  onControlsReady,
  onLoadingChange,
  scaleMultiplier = 1,
}: ModelSceneProps) {
  const { scene, camera, gl } = useThree();
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const verticalVelocityRef = useRef(0);
  const movementRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });
  const pointerRef = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    pointerId: null as number | null,
  });
  const directionRef = useRef(new THREE.Vector3());
  const moveVectorRef = useRef(new THREE.Vector3());
  const yawQuaternion = useRef(new THREE.Quaternion());
  const rotationEuler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const baseScaleRef = useRef(1);
  const lastZoomVector = useRef(new THREE.Vector3());

  const disposeObject = (object: THREE.Object3D) => {
    object.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      const material = (child as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (material) {
        if (Array.isArray(material)) {
          material.forEach((mat) => mat.dispose && mat.dispose());
        } else if (material.dispose) {
          material.dispose();
        }
      }
    });
  };

const alignInitialModel = (object: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 18 / maxDim;
  object.scale.setScalar(scale);
  baseScaleRef.current = scale;
  const adjustedBox = new THREE.Box3().setFromObject(object);
  const adjustedCenter = adjustedBox.getCenter(new THREE.Vector3());
  object.position.x -= adjustedCenter.x;
  object.position.z -= adjustedCenter.z;
  object.position.y -= adjustedBox.min.y;
};

const recenterModel = (object: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const adjustedBox = new THREE.Box3().setFromObject(object);
  const adjustedCenter = adjustedBox.getCenter(new THREE.Vector3());
  object.position.x -= adjustedCenter.x;
  object.position.z -= adjustedCenter.z;
  object.position.y -= adjustedBox.min.y;
};

  const removeCurrentModel = () => {
    if (!modelRef.current) return;
    disposeObject(modelRef.current);
    modelRef.current = null;
    setModel(null);
    baseScaleRef.current = 1;
  };

  const resetCamera = () => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(5, 5, 5);
    cam.lookAt(0, 0, 0);
    yawRef.current = cam.rotation.y;
    pitchRef.current = cam.rotation.x;
    movementRef.current = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
    };
    velocityRef.current.set(0, 0, 0);
    verticalVelocityRef.current = 0;
    rotationRef.current = { x: 0, y: 0, z: 0 };
    if (modelRef.current) {
      modelRef.current.rotation.set(0, 0, 0);
    }
  };

  useEffect(() => {
    resetCamera();
  }, [camera]);

  useEffect(() => {
    onControlsReady?.({
      reset: () => resetCamera(),
      rotate: (axis) => {
        if (!modelRef.current) return;
        const rotationAxis =
          axis === "x"
            ? new THREE.Vector3(1, 0, 0)
            : axis === "y"
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1);
        modelRef.current.rotateOnAxis(rotationAxis, ROTATION_RADIANS);
        rotationRef.current[axis] =
          (rotationRef.current[axis] + ROTATION_RADIANS) % (Math.PI * 2);
        recenterModel(modelRef.current);
      },
    });
    return () => {
      onControlsReady?.(null);
    };
  }, [camera, onControlsReady]);

  useEffect(() => {
    return () => {
      if (!modelRef.current) return;
      disposeObject(modelRef.current);
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraRef) return;
    cameraRef.current = camera as THREE.PerspectiveCamera;
  }, [camera, cameraRef]);

  // Pointer look controls
  useEffect(() => {
    const element = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerRef.current = {
        active: true,
        lastX: event.clientX,
        lastY: event.clientY,
        pointerId: event.pointerId,
      };
      element.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerRef.current.active) return;
      const dx = event.clientX - pointerRef.current.lastX;
      const dy = event.clientY - pointerRef.current.lastY;
      pointerRef.current.lastX = event.clientX;
      pointerRef.current.lastY = event.clientY;

      yawRef.current -= dx * LOOK_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - dy * LOOK_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT
      );
    };

    const endPointerInteraction = () => {
      pointerRef.current.active = false;
      if (pointerRef.current.pointerId !== null) {
        element.releasePointerCapture?.(pointerRef.current.pointerId);
      }
      pointerRef.current.pointerId = null;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      endPointerInteraction();
    };

    const handlePointerLeave = () => {
      endPointerInteraction();
    };

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerUp);
    element.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [gl]);

  // Scroll zoom controls
  useEffect(() => {
    const element = gl.domElement;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = -event.deltaY * ZOOM_SPEED;
      if (delta === 0) return;
      const direction = lastZoomVector.current
        .set(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .normalize();
      const nextPosition = camera.position.clone().addScaledVector(direction, delta);
      const distance = nextPosition.length();
      if (distance < MIN_ZOOM_DISTANCE) {
        nextPosition.setLength(MIN_ZOOM_DISTANCE);
      } else if (distance > MAX_ZOOM_DISTANCE) {
        nextPosition.setLength(MAX_ZOOM_DISTANCE);
      }
      camera.position.copy(nextPosition);
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [camera, gl]);

  // Keyboard movement controls
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        target.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select"
      );
    };

    const toggleMovement = (code: string, pressed: boolean) => {
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          movementRef.current.forward = pressed;
          break;
        case "KeyS":
        case "ArrowDown":
          movementRef.current.backward = pressed;
          break;
        case "KeyA":
        case "ArrowLeft":
          movementRef.current.left = pressed;
          break;
        case "KeyD":
        case "ArrowRight":
          movementRef.current.right = pressed;
          break;
        case "Space":
          movementRef.current.up = pressed;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          movementRef.current.down = pressed;
          break;
        default:
          break;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.repeat) return;
      toggleMovement(event.code, true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      toggleMovement(event.code, false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Add grid
  useEffect(() => {
    const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x1a1a1a);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    return () => {
      scene.remove(gridHelper);
    };
  }, [scene]);

  // Add lights
  useEffect(() => {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 15, 10);

    scene.add(ambientLight);
    scene.add(directionalLight);

    return () => {
      scene.remove(ambientLight);
      scene.remove(directionalLight);
    };
  }, [scene]);

  // Load model
  useEffect(() => {
    if (!modelUrl || !modelExtension) {
      removeCurrentModel();
      onLoadingChange?.(false);
      return;
    }

    let cancelled = false;
    onLoadingChange?.(true);

    const loadModel = async () => {
      try {
        let object: THREE.Object3D | null = null;

        if (modelExtension === "glb" || modelExtension === "gltf") {
          const response = await fetch(modelUrl);
          const arrayBuffer = await response.arrayBuffer();

          const { GLTFLoader } = await import(
            "three/examples/jsm/loaders/GLTFLoader"
          );
          const gltfLoader = new GLTFLoader();

          object = await new Promise<THREE.Object3D>((resolve, reject) => {
            gltfLoader.parse(
              arrayBuffer,
              "",
              (gltf: any) => {
                resolve(gltf.scene);
              },
              reject
            );
          });
        } else if (modelExtension === "obj") {
          const { OBJLoader } = await import(
            "three/examples/jsm/loaders/OBJLoader"
          );
          const manager = createLoadingManager(assetMap);
          const objLoader = manager ? new OBJLoader(manager) : new OBJLoader();
          const mtlUrl = findMtlUrl(assetMap, modelName);
          if (mtlUrl) {
            const { MTLLoader } = await import(
              "three/examples/jsm/loaders/MTLLoader"
            );
            const mtlLoader = manager ? new MTLLoader(manager) : new MTLLoader();
            const materials = await mtlLoader.loadAsync(mtlUrl);
            if (materials.setTexturePath) {
              materials.setTexturePath("");
            }
            const originalLoadTexture = materials.loadTexture.bind(materials);
            materials.loadTexture = (textureUrl, mapping, onLoad, onError) => {
              const resolved = resolveAssetUrl(assetMap, textureUrl) ?? textureUrl;
              const loader = new THREE.TextureLoader(manager ?? undefined);
              const texture = loader.load(resolved, onLoad, undefined, onError);
              if (mapping && texture) {
                texture.mapping = mapping;
              }
              return texture;
            };
            materials.preload();
            objLoader.setMaterials(materials);
          }

          const response = await fetch(modelUrl);
          const text = await response.text();
          object = objLoader.parse(text);
        } else if (modelExtension === "fbx") {
          const { FBXLoader } = await import(
            "three/examples/jsm/loaders/FBXLoader"
          );
          const loader = new FBXLoader();
          object = await new Promise<THREE.Object3D>((resolve, reject) => {
            loader.load(modelUrl, resolve, undefined, reject);
          });
        } else if (modelExtension === "bin" && pointCloud?.kind === "bin") {
          const response = await fetch(pointCloud.url);
          const arrayBuffer = await response.arrayBuffer();
          const parsed = parsePointCloud(arrayBuffer, pointCloud.hasHeaderCount);
          if (!parsed) {
            throw new Error("Unsupported point cloud binary layout.");
          }
          console.info("[pointcloud] Loaded", parsed.positions.length / 3, "points.", parsed.metadata);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(parsed.positions, 3));
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const material = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: false,
            color: new THREE.Color("#ffffff"),
          });
          object = new THREE.Points(geometry, material);
        } else if (modelExtension === "las" && pointCloud?.kind === "las") {
          const response = await fetch(pointCloud.url);
          const arrayBuffer = await response.arrayBuffer();
          const parsed = parseLasPointCloud(arrayBuffer);
          if (!parsed) {
            throw new Error("Unsupported LAS layout.");
          }
          console.info("[pointcloud-las] Loaded", parsed.positions.length / 3, "points.", parsed.metadata);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(parsed.positions, 3));
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const material = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: false,
            color: new THREE.Color("#ffffff"),
          });
          object = new THREE.Points(geometry, material);
        } else if (modelExtension === "pf" && poseData) {
          const response = await fetch(poseData.url);
          const text = await response.text();
          const poseGroup = buildPoseGroup(text);
          if (!poseGroup) {
            throw new Error("Unsupported pose file layout.");
          }
          console.info("[pose] Rendering", poseGroup.children.length, "poses.");
          object = poseGroup;
        } else if (modelExtension === "plf" && poseLocations) {
          const response = await fetch(poseLocations.url);
          const text = await response.text();
          const positions = buildPoseLocations(text);
          if (!positions) {
            throw new Error("Unsupported pose location layout.");
          }
          console.info(
            "[pose-locations] Rendering",
            positions.length / 3,
            "pose points."
          );
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          const material = new THREE.PointsMaterial({
            size: 0.05,
            color: new THREE.Color("#ff8800"),
          });
          object = new THREE.Points(geometry, material);
        }

        if (object) {
          if (cancelled) {
            disposeObject(object);
            return;
          }

          alignInitialModel(object);

          removeCurrentModel();
          modelRef.current = object;
          setModel(object);
        }
      } catch (error) {
        console.error("[v0] Failed to load model:", error);
      } finally {
        if (!cancelled) {
          onLoadingChange?.(false);
        }
      }
    };

    loadModel();
    return () => {
      cancelled = true;
      onLoadingChange?.(false);
    };
  }, [
    modelUrl,
    modelExtension,
    assetMap,
    modelName,
    pointCloud,
    poseData,
    poseLocations,
    onLoadingChange,
  ]);

  useEffect(() => {
    if (!modelRef.current) return;
    const baseScale = baseScaleRef.current || 1;
    modelRef.current.scale.setScalar(baseScale * scaleMultiplier);
    recenterModel(modelRef.current);
  }, [scaleMultiplier]);

  useFrame((_, delta) => {
    rotationEuler.current.set(pitchRef.current, yawRef.current, 0, "YXZ");
    camera.quaternion.setFromEuler(rotationEuler.current);

    const movement = movementRef.current;
    const direction = directionRef.current;
    direction.set(0, 0, 0);
    if (movement.forward) direction.z -= 1;
    if (movement.backward) direction.z += 1;
    if (movement.left) direction.x -= 1;
    if (movement.right) direction.x += 1;
    const vertical = (movement.up ? 1 : 0) - (movement.down ? 1 : 0);

    direction.normalize();

    const moveVector = moveVectorRef.current;
    moveVector.set(direction.x, 0, direction.z);
    yawQuaternion.current.setFromAxisAngle(WORLD_UP, yawRef.current);
    moveVector.applyQuaternion(yawQuaternion.current);

    const targetVelocity = moveVector.multiplyScalar(MOVE_SPEED);
    velocityRef.current.lerp(targetVelocity, Math.min(ACCELERATION * delta, 1));
    camera.position.addScaledVector(velocityRef.current, delta);

    const targetVertical = vertical * MOVE_SPEED;
    verticalVelocityRef.current = THREE.MathUtils.lerp(
      verticalVelocityRef.current,
      targetVertical,
      Math.min(
        (vertical !== 0 ? ACCELERATION : DECELERATION) * delta,
        1
      )
    );
    camera.position.y += verticalVelocityRef.current * delta;
  });

  return <>{model ? <primitive object={model} /> : null}</>;
}
