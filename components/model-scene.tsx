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
  onRotateRequest?: (axis: "x" | "y" | "z") => void;
  cameraRef?: MutableRefObject<THREE.PerspectiveCamera | null>;
  onControlsReady?: (api: ControlsApi | null) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const PITCH_LIMIT = Math.PI / 2 - 0.05;
const MOVE_SPEED = 4;
const ACCELERATION = 14;
const DECELERATION = 10;
const LOOK_SENSITIVITY = 0.003;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ROTATION_DEGREES = 90;
const ROTATION_RADIANS = THREE.MathUtils.degToRad(ROTATION_DEGREES);

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

export function ModelScene({
  modelUrl,
  modelExtension,
  modelName,
  assetMap,
  onRotateRequest,
  cameraRef,
  onControlsReady,
  onLoadingChange,
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
  const scale = 8 / maxDim;
  object.scale.setScalar(scale);
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
  }, [modelUrl, modelExtension, assetMap, modelName, onLoadingChange]);

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
