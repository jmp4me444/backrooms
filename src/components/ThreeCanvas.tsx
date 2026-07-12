import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RoomTheme, SearchableItem } from '../types';
import { EyeOff, Radio, Compass } from 'lucide-react';

import Synthesizer from '../audio/Synthesizer';
import VHSOverlay from './VHSOverlay';

interface ThreeCanvasProps {
  theme: RoomTheme;
  keywords: string;
  items: SearchableItem[];
  onItemFound: (itemId: string) => void;
  entityDistance: number;
  setEntityDistance: (dist: number) => void;
  onLevelTransition: (newSeed: number) => void;
}

interface LightState {
  light: THREE.PointLight;
  panel: THREE.Mesh;
  originalIntensity: number;
  flickerTicks: number;
  flickerState: boolean;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  theme,
  keywords,
  items,
  onItemFound,
  entityDistance,
  setEntityDistance,
  onLevelTransition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // React state for HUD instructions
  const [hudMessage, setHudMessage] = useState<string>('USE WASD / ARROWS TO MOVE. DRAG TO LOOK.');
  const [activeItemNear, setActiveItemNear] = useState<SearchableItem | null>(null);
  const [activeDoorNear, setActiveDoorNear] = useState<any | null>(null);
  const [flashlightOn, setFlashlightOn] = useState<boolean>(true);
  const [noclipMode, setNoclipMode] = useState<boolean>(false);
  const noclipRef = useRef<boolean>(noclipMode);
  useEffect(() => {
    noclipRef.current = noclipMode;
  }, [noclipMode]);
  const [playerPos, setPlayerPos] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
 
  // Refs for animation loop & input tracking
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const lookKeysRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({ up: false, down: false, left: false, right: false });
  const mouseRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const doorsRef = useRef<any[]>([]);

  // Joystick DOM and state tracking refs
  const leftKnobRef = useRef<HTMLDivElement>(null);
  const rightKnobRef = useRef<HTMLDivElement>(null);
  const joyLeftTouch = useRef<{ startX: number; startY: number; active: boolean; identifier: number }>({ startX: 0, startY: 0, active: false, identifier: -1 });
  const joyRightTouch = useRef<{ startX: number; startY: number; active: boolean }>({ startX: 0, startY: 0, active: false });
  const joyRightOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });


  // Setup refs for sharing Three.js objects with the animation frame
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const flashlightRef = useRef<THREE.SpotLight | null>(null);
  const itemsMeshesRef = useRef<{ [key: string]: THREE.Group }>({});
  const entityMeshRef = useRef<THREE.Group | null>(null);
  
  const hammerRef = useRef<THREE.Group | null>(null);
  const isSwingingRef = useRef<boolean>(false);
  const swingStartTimeRef = useRef<number>(0);
  const hasHitThisSwingRef = useRef<boolean>(false);
  const breakablesRef = useRef<{ mesh: THREE.Object3D; type: 'wood' | 'metal' | 'plastic' | 'soft' }[]>([]);
  const debrisRef = useRef<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; spawnTime: number }[]>([]);
  const waterCellsRef = useRef<Set<string>>(new Set());
  const fountainsRef = useRef<{ mesh: THREE.Group; particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; oy: number }[] }[]>([]);
  const steamParticlesRef = useRef<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number; ox: number; oy: number; oz: number }[]>([]);

  // Map dimensions
  const MAP_SIZE = 14;
  const CELL_SIZE = 4;
  const mapGridRef = useRef<number[][]>([]);

  // Trigger hammer swing animation and play whoosh audio sound
  const triggerHammerSwing = () => {
    if (isSwingingRef.current) return;
    isSwingingRef.current = true;
    hasHitThisSwingRef.current = false;
    swingStartTimeRef.current = performance.now();
    if (hammerRef.current) {
      hammerRef.current.visible = true;
    }
    Synthesizer.triggerSwingWhoosh();
  };

  // Spawn visual debris particles flying outwards when a prop shatters
  const spawnDebrisParticles = (mesh: THREE.Object3D) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const centerPos = new THREE.Vector3();
    mesh.getWorldPosition(centerPos);

    // Dynamic color extraction based on the target object's child materials
    const colors: THREE.Color[] = [];
    mesh.traverse(child => {
      if ((child as any).isMesh && (child as any).material) {
        const mat = (child as any).material;
        if (mat.color) {
          colors.push(mat.color.clone());
        }
      }
    });
    if (colors.length === 0) {
      colors.push(new THREE.Color(0x8b5a2b)); // Default wooden fallback tone
    }

    // Spawn 8-12 physical debris particles
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const size = 0.08 + Math.random() * 0.12;
      const geo = new THREE.BoxGeometry(size, size, size);
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.9,
        metalness: 0.1
      });
      const particle = new THREE.Mesh(geo, mat);
      particle.castShadow = true;
      particle.receiveShadow = true;

      // Start debris positions clustered near the prop's visual center
      particle.position.copy(centerPos);
      particle.position.x += (Math.random() - 0.5) * 0.4;
      particle.position.y += Math.random() * 0.8; // Burst vertical spread
      particle.position.z += (Math.random() - 0.5) * 0.4;

      // Radial outward explosion vector physics
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.5;
      const vx = Math.cos(angle) * speed;
      const vy = 2.0 + Math.random() * 4.0; // Initial vertical upward force
      const vz = Math.sin(angle) * speed;

      scene.add(particle);

      debrisRef.current.push({
        mesh: particle,
        vx,
        vy,
        vz,
        spawnTime: performance.now()
      });
    }
  };

  // Perform object destruction and play corresponding sound effect
  const smashObject = (breakable: { mesh: THREE.Object3D; type: 'wood' | 'metal' | 'plastic' | 'soft' }) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Trigger synthesis of material smash sound
    Synthesizer.triggerSmashSound(breakable.type);

    // Burst visual particles
    spawnDebrisParticles(breakable.mesh);

    // Clean up Three.js rendering scene child graph
    scene.remove(breakable.mesh);

    // Filter out destroyed entry from tracking references
    breakablesRef.current = breakablesRef.current.filter(b => b !== breakable);
  };

  // Detect hits on breakable objects within range (2.6m) and in front of the player (63 degree cone)
  const performHitDetection = () => {
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!camera || !scene) return;

    const playerPos = camera.position;
    // Get normalized camera forward gaze direction
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

    let closestBreakable = null;
    let closestDist = 2.6; // Forgiving melee range

    for (let breakable of breakablesRef.current) {
      const objPos = new THREE.Vector3();
      breakable.mesh.getWorldPosition(objPos);

      const dist = playerPos.distanceTo(objPos);
      if (dist < closestDist) {
        // Calculate angle direction to the prop
        const dirToObj = objPos.clone().sub(playerPos).normalize();
        const dot = forward.dot(dirToObj);

        // dot > 0.45 corresponds to approx a 63-degree view cone in front of the camera
        if (dot > 0.45) {
          closestBreakable = breakable;
          closestDist = dist;
        }
      }
    }

    if (closestBreakable) {
      smashObject(closestBreakable);
    }
  };

  // Generate normal map using Sobel filter from a texture canvas
  const generateNormalMapFromCanvas = (srcCanvas: HTMLCanvasElement, bumpScale: number = 2.0): THREE.Texture => {
    const width = srcCanvas.width;
    const height = srcCanvas.height;
    const normCanvas = document.createElement('canvas');
    normCanvas.width = width;
    normCanvas.height = height;
    const normCtx = normCanvas.getContext('2d')!;

    const srcCtx = srcCanvas.getContext('2d')!;
    const imgData = srcCtx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    const getLuminance = (x: number, y: number): number => {
      const px = (x + width) % width;
      const py = (y + height) % height;
      const idx = (py * width + px) * 4;
      return (pixels[idx] * 0.299 + pixels[idx+1] * 0.587 + pixels[idx+2] * 0.114) / 255;
    };

    const normImgData = normCtx.createImageData(width, height);
    const normPixels = normImgData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const l = getLuminance(x - 1, y);
        const r = getLuminance(x + 1, y);
        const t = getLuminance(x, y - 1);
        const b = getLuminance(x, y + 1);

        const dx = (r - l) * bumpScale;
        const dy = (b - t) * bumpScale;

        const len = Math.sqrt(dx * dx + dy * dy + 1.0);
        const nx = dx / len;
        const ny = dy / len;
        const nz = 1.0 / len;

        const idx = (y * width + x) * 4;
        normPixels[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        normPixels[idx+1] = Math.round((ny * 0.5 + 0.5) * 255);
        normPixels[idx+2] = Math.round((nz * 0.5 + 0.5) * 255);
        normPixels[idx+3] = 255;
      }
    }

    normCtx.putImageData(normImgData, 0, 0);

    const texture = new THREE.CanvasTexture(normCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };

  // Generate roughness map canvas from a texture
  const generateRoughnessMap = (type: string, baseColor: string, size: number): THREE.Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    if (type === 'tiles' || type === 'hospital') {
      // Tiles are glossy (roughness 0.15), grout is rough (roughness 0.9)
      ctx.fillStyle = 'rgba(230, 230, 230, 1)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(38, 38, 38, 1)';
      for (let i = 0; i < size; i += 64) {
        for (let j = 0; j < size; j += 64) {
          ctx.fillRect(i + 2, j + 2, 60, 60);
        }
      }
    } else if (type === 'concrete') {
      // Concrete is mostly rough (0.85) with some glossy damp patches
      ctx.fillStyle = 'rgba(216, 216, 216, 1)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(50, 50, 50, 0.4)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 15 + Math.random() * 30, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'water') {
      // Small pool floor tiles: tiles are very glossy (0.08 = value 20), grout is rough (0.85 = value 216)
      ctx.fillStyle = 'rgba(216, 216, 216, 1)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(20, 20, 20, 1)';
      for (let i = 0; i < size; i += 32) {
        for (let j = 0; j < size; j += 32) {
          ctx.fillRect(i + 1.5, j + 1.5, 29, 29);
        }
      }
    } else if (type === 'metal') {
      ctx.fillStyle = 'rgba(90, 90, 90, 1)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(200, 200, 200, 0.3)'; // rust/grime spots
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 10 + Math.random() * 20, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'linoleum') {
      // Polished office/hospital linoleum: highly glossy (roughness 0.20 = value 51)
      ctx.fillStyle = 'rgba(51, 51, 51, 1)';
      ctx.fillRect(0, 0, size, size);
      // Subtle scuffs
      ctx.fillStyle = 'rgba(180, 180, 180, 0.08)';
      for (let i = 0; i < 15; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 8, 1);
      }
    } else if (type === 'carpet') {
      // Carpet: highly absorbing, rough (roughness 0.95 = value 242)
      ctx.fillStyle = 'rgba(242, 242, 242, 1)';
      ctx.fillRect(0, 0, size, size);
    } else if (type === 'wood') {
      // Wood boards: semi-gloss boards (roughness 0.45 = value 115)
      ctx.fillStyle = 'rgba(115, 115, 115, 1)';
      ctx.fillRect(0, 0, size, size);
      // Rough gaps and grain
      ctx.fillStyle = 'rgba(220, 220, 220, 1)';
      for (let y = 0; y < size; y += 64) {
        ctx.fillRect(0, y, size, 2);
      }
    } else if (type === 'checkerboard') {
      // Checkerboard tiles: semi-gloss (roughness 0.3 = value 76)
      ctx.fillStyle = 'rgba(76, 76, 76, 1)';
      ctx.fillRect(0, 0, size, size);
      // Grout lines
      ctx.fillStyle = 'rgba(200, 200, 200, 1)';
      for (let i = 0; i <= size; i += 64) {
        ctx.fillRect(i - 1, 0, 2, size);
        ctx.fillRect(0, i - 1, size, 2);
      }
    } else if (type === 'cyber') {
      // Glossy cyber floor: (roughness 0.25 = value 64)
      ctx.fillStyle = 'rgba(64, 64, 64, 1)';
      ctx.fillRect(0, 0, size, size);
    } else if (type === 'matrix') {
      // Semi-gloss matrix console profile: (roughness 0.45 = value 115)
      ctx.fillStyle = 'rgba(115, 115, 115, 1)';
      ctx.fillRect(0, 0, size, size);
    } else if (type === 'bamboo') {
      // Semi-rough bamboo: (roughness 0.65 = value 166)
      ctx.fillStyle = 'rgba(166, 166, 166, 1)';
      ctx.fillRect(0, 0, size, size);
    } else if (type === 'sand') {
      // Highly rough sand: (roughness 0.92 = value 235)
      ctx.fillStyle = 'rgba(235, 235, 235, 1)';
      ctx.fillRect(0, 0, size, size);
    } else if (type === 'brick') {
      // Bricks: rough texture (roughness 0.75 = value 190), joints are rougher (roughness 0.92 = value 235)
      ctx.fillStyle = 'rgba(235, 235, 235, 1)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(190, 190, 190, 1)';
      const brickH = 32;
      const brickW = 64;
      for (let y = 0; y < size; y += brickH) {
        const offset = (y / brickH) % 2 === 0 ? 0 : brickW / 2;
        for (let x = offset; x < size + brickW; x += brickW) {
          ctx.fillRect((x % size) + 1.5, y + 1.5, brickW - 3, brickH - 3);
        }
      }
    } else {
      // Default wallpaper or other textures: general matte finish (roughness 0.8 = value 204)
      ctx.fillStyle = 'rgba(204, 204, 204, 1)';
      ctx.fillRect(0, 0, size, size);
      // Add subtle noise
      for (let i = 0; i < 1500; i++) {
        const val = 180 + Math.floor(Math.random() * 48);
        ctx.fillStyle = `rgba(${val}, ${val}, ${val}, 0.08)`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };

  interface ProceduralMaps {
    map: THREE.Texture;
    normalMap: THREE.Texture;
    roughnessMap: THREE.Texture;
  }

  // Procedural canvas PBR map bundle builder
  const createProceduralMaps = (type: string, baseColor: string, isWall: boolean = false): ProceduralMaps => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    if (isWall) {
      const query = keywords.toLowerCase().trim();
      const words = query.split(/[\s,]+/);

      if (words.includes('rainbow')) {
        const grad = ctx.createLinearGradient(0, 0, size, 0);
        grad.addColorStop(0, '#ff3b30');
        grad.addColorStop(0.17, '#ff9500');
        grad.addColorStop(0.34, '#ffcc00');
        grad.addColorStop(0.51, '#4cd964');
        grad.addColorStop(0.68, '#5ac8fa');
        grad.addColorStop(0.85, '#007aff');
        grad.addColorStop(1.0, '#5856d6');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = 32; i < size; i += 64) {
          ctx.beginPath();
          ctx.arc(i, 40, 15, 0, Math.PI * 2);
          ctx.arc(i + 12, 35, 18, 0, Math.PI * 2);
          ctx.arc(i + 24, 40, 15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      else if (words.some(w => ['stripe', 'stripes', 'striped'].includes(w))) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < size; i += 32) {
          ctx.fillRect(i, 0, 16, size);
        }
      }
      else if (words.some(w => ['grid', 'grids'].includes(w))) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(0,255,0,0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= size; i += 16) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
        }
      }
      else if (words.some(w => ['brick', 'bricks', 'brickwork'].includes(w))) {
        ctx.fillStyle = '#b23b3b';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#e2c5c5';
        ctx.lineWidth = 2;
        const rows = 8;
        const cols = 4;
        const rowH = size / rows;
        const colW = size / cols;
        for (let r = 0; r <= rows; r++) {
          ctx.beginPath(); ctx.moveTo(0, r * rowH); ctx.lineTo(size, r * rowH); ctx.stroke();
          if (r < rows) {
            const offset = (r % 2) * (colW / 2);
            for (let c = 0; c <= cols + 1; c++) {
              ctx.beginPath();
              ctx.moveTo(c * colW - offset, r * rowH);
              ctx.lineTo(c * colW - offset, (r + 1) * rowH);
              ctx.stroke();
            }
          }
        }
      }
      else if (words.some(w => ['polka', 'dots', 'spotted', 'dot'].includes(w))) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff';
        for (let i = 16; i < size; i += 32) {
          for (let j = 16; j < size; j += 32) {
            const offset = ((j / 32) % 2 === 0) ? 0 : 16;
            ctx.beginPath();
            ctx.arc((i + offset) % size, j, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      else if (words.some(w => ['glitch', 'static', 'matrix', 'noise', 'digital'].includes(w))) {
        ctx.fillStyle = '#050906';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#10b981';
        ctx.font = '8px monospace';
        for (let i = 0; i < size; i += 16) {
          for (let j = 0; j < size; j += 10) {
            const char = Math.random() > 0.5 ? '1' : '0';
            ctx.fillText(char, i, j);
          }
        }
      }
      else if (words.some(w => ['star', 'stars', 'starry', 'space'].includes(w))) {
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffdf00';
        for (let i = 0; i < 25; i++) {
          const sx = Math.random() * size;
          const sy = Math.random() * size;
          ctx.fillRect(sx - 2, sy, 5, 1);
          ctx.fillRect(sx, sy - 2, 1, 5);
        }
      }
      else if (words.some(w => ['flower', 'flowers', 'floral', 'garden'].includes(w))) {
        ctx.fillStyle = '#fce4ec';
        ctx.fillRect(0, 0, size, size);
        const drawFlower = (fx: number, fy: number) => {
          ctx.fillStyle = '#ff80ab';
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2.5) {
            ctx.beginPath();
            ctx.arc(fx + Math.cos(angle) * 8, fy + Math.sin(angle) * 8, 6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#ffd54f';
          ctx.beginPath();
          ctx.arc(fx, fy, 5, 0, Math.PI * 2);
          ctx.fill();
        };
        for (let i = 32; i < size; i += 64) {
          for (let j = 32; j < size; j += 64) {
            drawFlower(i, j);
          }
        }
      }
      else if (words.some(w => ['wood', 'planks', 'wooden'].includes(w))) {
        ctx.fillStyle = '#a1785c';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#4a2f1b';
        ctx.lineWidth = 2;
        for (let i = 0; i <= size; i += 40) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        for (let i = 10; i < size; i += 20) {
          ctx.beginPath();
          ctx.arc(i, size / 2, size / 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      else if (words.some(w => ['heart', 'hearts', 'love'].includes(w))) {
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#e91e63';
        const drawHeart = (hx: number, hy: number) => {
          ctx.beginPath();
          ctx.moveTo(hx, hy + 4);
          ctx.bezierCurveTo(hx - 6, hy - 4, hx - 12, hy, hx, hy + 14);
          ctx.bezierCurveTo(hx + 12, hy, hx + 6, hy - 4, hx, hy + 4);
          ctx.fill();
        };
        for (let i = 24; i < size; i += 48) {
          for (let j = 24; j < size; j += 48) {
            const offset = ((j / 48) % 2 === 0) ? 0 : 24;
            drawHeart((i + offset) % size, j);
          }
        }
      }
      else if (words.some(w => ['checker', 'checkers', 'checkerboard'].includes(w))) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        const boxSize = 32;
        for (let i = 0; i < size; i += boxSize) {
          for (let j = 0; j < size; j += boxSize) {
            if ((i / boxSize + j / boxSize) % 2 === 0) {
              ctx.fillRect(i, j, boxSize, boxSize);
            }
          }
        }
      }
    }

    if (type === 'default') {
      ctx.fillStyle = '#b3a078';
      for (let i = 0; i < size; i += 16) {
        ctx.fillRect(i, 0, 2, size);
      }
      ctx.fillStyle = '#9e8c66';
      for (let i = 0; i < size; i += 32) {
        for (let j = 0; j < size; j += 32) {
          ctx.beginPath();
          ctx.moveTo(i + 8, j);
          ctx.lineTo(i + 16, j + 8);
          ctx.lineTo(i + 8, j + 16);
          ctx.lineTo(i, j + 8);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (type === 'concrete') {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        let cx = Math.random() * size;
        let cy = Math.random() * size;
        ctx.moveTo(cx, cy);
        for (let i = 0; i < 5; i++) {
          cx += (Math.random() - 0.5) * 40;
          cy += (Math.random() - 0.5) * 40;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    } else if (type === 'water') {
      // Clean square tiles for pool bottoms (32x32px tiles with soft blue/white grout)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= size; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
    } else if (type === 'tiles' || type === 'hospital') {
      const isCeilingBeige = baseColor === '#ccbe9f' || baseColor === '#d6cbac';
      ctx.strokeStyle = isCeilingBeige 
        ? 'rgba(0,0,0,0.22)' 
        : type === 'hospital' 
          ? 'rgba(0,0,0,0.1)' 
          : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = isCeilingBeige ? 1 : 2;
      for (let i = 0; i <= size; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
      if (!isCeilingBeige) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let i = 0; i < size; i += 64) {
          ctx.fillRect(i + 2, 2, 60, 4);
          ctx.fillRect(2, i + 2, 4, 60);
        }
      }
    } else if (type === 'metal') {
      ctx.strokeStyle = '#2b2623';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, size, size);
      ctx.beginPath();
      ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
      ctx.stroke();
      
      ctx.fillStyle = '#1c1816';
      const rivets = [
        [15, 15], [size / 2 - 15, 15], [size / 2 + 15, 15], [size - 15, 15],
        [15, size / 2 - 15], [size - 15, size / 2 - 15],
        [15, size / 2 + 15], [size - 15, size / 2 + 15],
        [15, size - 15], [size / 2 - 15, size - 15], [size / 2 + 15, size - 15], [size - 15, size - 15]
      ];
      rivets.forEach(([rx, ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6e635c';
        ctx.beginPath(); ctx.arc(rx - 1, ry - 1, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1c1816';
      });
    } else if (type === 'brick') {
      ctx.strokeStyle = '#1d1f18';
      ctx.lineWidth = 2;
      const brickH = 32;
      const brickW = 64;
      for (let y = 0; y < size; y += brickH) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        const offset = (y / brickH) % 2 === 0 ? 0 : brickW / 2;
        for (let x = offset; x < size + brickW; x += brickW) {
          ctx.beginPath(); ctx.moveTo(x % size, y); ctx.lineTo(x % size, y + brickH); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(64,80,36,0.3)';
      for (let i = 0; i < 15; i++) {
        ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, 10 + Math.random() * 20, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 'cyber') {
      ctx.fillStyle = '#06000c';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#d633ff';
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
      ctx.fillStyle = '#00f0ff';
      for (let i = 0; i < size; i += 64) {
        ctx.fillRect(i + 30, i + 30, 4, 4);
      }
    } else if (type === 'carpet') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 4000; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 3000; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
      ctx.fillStyle = 'rgba(100, 85, 55, 0.2)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, 8 + Math.random() * 24, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 'wood') {
      const boardH = 64;
      ctx.strokeStyle = '#1e1b12';
      ctx.lineWidth = 3;
      for (let y = 0; y < size; y += boardH) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 15); ctx.bezierCurveTo(size * 0.25, y + 5, size * 0.75, y + 25, size, y + 15);
        ctx.moveTo(0, y + 45); ctx.bezierCurveTo(size * 0.25, y + 55, size * 0.75, y + 35, size, y + 45);
        ctx.stroke();
        ctx.strokeStyle = '#1e1b12';
        ctx.lineWidth = 3;
      }
    } else if (type === 'circus') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#d32f2f';
      const stripeW = 32;
      for (let i = 0; i < size; i += stripeW * 2) {
        ctx.fillRect(i, 0, stripeW, size);
      }
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, 'rgba(0,0,0,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    } else if (type === 'checkerboard') {
      ctx.fillStyle = '#fbc02d';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#d32f2f';
      const boxSize = 64;
      for (let i = 0; i < size; i += boxSize) {
        for (let j = 0; j < size; j += boxSize) {
          if ((i / boxSize + j / boxSize) % 2 === 0) {
            ctx.fillRect(i, j, boxSize, boxSize);
          }
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= size; i += boxSize) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
    } else if (type === 'matrix') {
      ctx.fillStyle = '#030603';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#00ff66';
      ctx.font = '9px Courier New, monospace';
      for (let i = 0; i < size; i += 16) {
        for (let j = 0; j < size; j += 10) {
          const char = Math.random() > 0.5 ? '1' : '0';
          ctx.fillText(char, i, j);
        }
      }
    } else if (type === 'bamboo') {
      // Draw vertical bamboo stalks
      const colW = 16;
      for (let i = 0; i < size; i += colW) {
        // Bamboo stalk gradient
        const grad = ctx.createLinearGradient(i, 0, i + colW, 0);
        grad.addColorStop(0, '#5e7d44');
        grad.addColorStop(0.35, '#8cb86b');
        grad.addColorStop(0.7, '#a9d687');
        grad.addColorStop(1.0, '#4f6c37');
        ctx.fillStyle = grad;
        ctx.fillRect(i, 0, colW, size);

        // Draw node lines (horizontal rings) every 48 pixels
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        for (let y = 32; y < size; y += 48) {
          ctx.fillRect(i, y, colW, 3);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let y = 33; y < size; y += 48) {
          ctx.fillRect(i, y + 1, colW, 1.5);
        }
      }
    } else if (type === 'sand') {
      // Grainy beach sand matching baseColor
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, size, size);

      // Fine sand grains with neutral overlay tints
      for (let k = 0; k < 1800; k++) {
        const sx = Math.random() * size;
        const sy = Math.random() * size;
        const colorSeed = Math.random();
        ctx.fillStyle = colorSeed < 0.5 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    } else if (type === 'thatch') {
      // Woven thatch matching baseColor
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, size, size);

      // Draw overlapping diagonal straw lines with neutral overlay tints
      ctx.lineWidth = 2.0;
      for (let k = 0; k < 120; k++) {
        ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        const startX = Math.random() * (size + 30) - 15;
        const startY = Math.random() * (size + 30) - 15;
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + 24 + Math.random() * 20, startY + 12 + Math.random() * 12);
        ctx.stroke();
      }
    }

    // Clone canvas to apply high-frequency normal bump details
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bumpCtx = bumpCanvas.getContext('2d')!;
    bumpCtx.drawImage(canvas, 0, 0);

    // Apply granular plaster noise grain to walls/plaster
    const isSpecialMat = type === 'cyber' || type === 'matrix';
    const isWaterFloor = type === 'water';
    if (!isSpecialMat && !isWaterFloor) {
      bumpCtx.fillStyle = 'rgba(128, 128, 128, 0.12)';
      for (let i = 0; i < 2500; i++) {
        bumpCtx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;

    const normalScale = (type === 'concrete' || type === 'brick' || type === 'wood') ? 3.2 : 1.6;
    const normalMap = generateNormalMapFromCanvas(bumpCanvas, normalScale);
    const roughnessMap = generateRoughnessMap(type, baseColor, size);

    return { map, normalMap, roughnessMap };
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      
      // Toggle Flashlight (F)
      if (k === 'f') {
        setFlashlightOn(prev => !prev);
      }

      // Swing/Invoke Hammer (H)
      if (k === 'h') {
        triggerHammerSwing();
      }
      
      // Trigger Item Inspection (E)
      if (k === 'e' && activeItemNear) {
        onItemFound(activeItemNear.id);
      }

      // Trigger Door Swing (E)
      if (k === 'e' && activeDoorNear) {
        activeDoorNear.isOpen = !activeDoorNear.isOpen;
        // play a small trigger sound
        Synthesizer.triggerEntityGlitch();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeItemNear, activeDoorNear, onItemFound]);

  // Drag to Look Controls
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const sensitivity = 0.003;
      mouseRef.current.yaw -= e.movementX * sensitivity;
      mouseRef.current.pitch -= e.movementY * sensitivity;
      
      const limit = Math.PI / 2.2;
      mouseRef.current.pitch = Math.max(-limit, Math.min(limit, mouseRef.current.pitch));
    };

    const handleMouseUpOrLeave = () => {
      isDraggingRef.current = false;
    };

    // Mobile Touch Controls (Swipe to Look) - Pointer Isolated
    let lookTouchId = -1;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target && typeof target.closest === 'function' && target.closest('.touch-joystick-base')) {
        return;
      }
      e.preventDefault(); // Prevent Chrome/Safari mobile page-scrolling and default gestures
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        lookTouchId = touch.identifier;
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (lookTouchId === -1 || !touchStartRef.current) return;
      e.preventDefault(); // Prevent default Chrome mobile pull-to-refresh or navigation swipes
      
      // Find the look touch by identifier
      let touch = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === lookTouchId) {
          touch = e.touches[i];
          break;
        }
      }
      if (!touch) return;
      
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      
      const sensitivity = 0.008;
      mouseRef.current.yaw -= deltaX * sensitivity;
      mouseRef.current.pitch -= deltaY * sensitivity;
      
      const limit = Math.PI / 2.2;
      mouseRef.current.pitch = Math.max(-limit, Math.min(limit, mouseRef.current.pitch));
      
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          lookTouchId = -1;
          touchStartRef.current = null;
          break;
        }
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUpOrLeave);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUpOrLeave);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  // Left Joystick Touch Handlers (Move)
  const handleLeftTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      joyLeftTouch.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        active: true,
        identifier: touch.identifier
      };
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const handleLeftTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!joyLeftTouch.current.active) return;
    
    // Track the correct touch by its unique pointer identifier safely using a for loop
    let touch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joyLeftTouch.current.identifier) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;
    
    let dx = touch.clientX - joyLeftTouch.current.startX;
    let dy = touch.clientY - joyLeftTouch.current.startY;
    
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxRadius = 30;
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    if (leftKnobRef.current) {
      leftKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    keysRef.current['w'] = dy < -8;
    keysRef.current['s'] = dy > 8;
    keysRef.current['a'] = dx < -8;
    keysRef.current['d'] = dx > 8;
  };

  const handleLeftTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    joyLeftTouch.current.active = false;
    joyLeftTouch.current.identifier = -1;
    if (leftKnobRef.current) {
      leftKnobRef.current.style.transform = 'translate(0px, 0px)';
    }
    keysRef.current['w'] = false;
    keysRef.current['s'] = false;
    keysRef.current['a'] = false;
    keysRef.current['d'] = false;
  };

  // Right Joystick Touch Handlers (Look)
  const handleRightTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      joyRightTouch.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        active: true
      };
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const handleRightTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!joyRightTouch.current.active || e.touches.length === 0) return;
    const touch = e.touches[0];
    let dx = touch.clientX - joyRightTouch.current.startX;
    let dy = touch.clientY - joyRightTouch.current.startY;

    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxRadius = 30;
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    if (rightKnobRef.current) {
      rightKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    joyRightOffset.current = { x: dx, y: dy };
  };

  const handleRightTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    joyRightTouch.current.active = false;
    joyRightOffset.current = { x: 0, y: 0 };
    if (rightKnobRef.current) {
      rightKnobRef.current.style.transform = 'translate(0px, 0px)';
    }
  };

  // Main Three.js Lifecycle
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // 1. Scene & Render Engine Initialization
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Set theme fog
    scene.background = new THREE.Color(theme.fogColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);

    // Perspective Camera
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 1000);
    // Spawn player in cell [1, 1]
    camera.position.set(CELL_SIZE * 1.0, 1.6, CELL_SIZE * 1.0);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    // 2. Generate Maze Logic Array
    // 1 = wall, 2 = column, 0 = walkway
    const grid: number[][] = Array(MAP_SIZE).fill(0).map(() => Array(MAP_SIZE).fill(0));
    
    // Seeds map based on theme seed to keep levels completely randomized each generation!
    const seedNum = theme.seed;
    
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        // Enforce border walls
        if (x === 0 || x === MAP_SIZE - 1 || z === 0 || z === MAP_SIZE - 1) {
          grid[x][z] = 1;
        } else if (x > 1 && z > 1 && x < MAP_SIZE - 2 && z < MAP_SIZE - 2) {
          // Generate internal maze structures deterministically based on seedNum
          const val = (Math.sin(x * 12.9898 + z * 78.233 + seedNum) * 43758.5453) % 1;
          const absVal = Math.abs(val);
          
          if (absVal > 0.88) {
            grid[x][z] = 1; // Wall block
          } else if (absVal > 0.70) {
            grid[x][z] = 2; // Column pillar
          }
        }
      }
    }
    // Make sure start position at [1,1], [1,2], [2,1], [2,2] are always clear walkway
    // Make sure player starting cell and surrounding cells form an open starting lobby!
    grid[1][1] = 0; // Player cell
    grid[1][2] = 0; // Walkway South
    grid[2][1] = 0; // Walkway East
    grid[2][2] = 0; // Southeast lobby
    grid[2][3] = 0;
    grid[3][2] = 0;
    grid[3][1] = 0;

    // Explicitly guarantee a door and a staircase are spawned at the boundaries of this starting lobby!
    grid[1][3] = 3; // 100% Guaranteed Door 2 cells South of player!
    grid[3][3] = 4; // 100% Guaranteed Staircase 2 cells East and 2 cells South of player!
    
    // Clear walkways on the other side of the doors/stairs to prevent entrapment
    grid[1][4] = 0;
    grid[3][4] = 0;

    // Place Doors (3) randomly in open corridors (walkways grid === 0)
    for (let x = 2; x < MAP_SIZE - 2; x++) {
      for (let z = 2; z < MAP_SIZE - 2; z++) {
        if (grid[x][z] === 0) {
          const doorRoll = Math.abs(Math.sin(x * 93.2 + z * 14.3 + seedNum) * 100) % 1;
          // Spawn door in open corridor with ~12% probability
          if (doorRoll > 0.88) {
            grid[x][z] = 3;
          }
        }
      }
    }

    // Place exactly one Staircase (4) in the level to guarantee ascension path
    let stairsPlaced = false;
    const scanOffset = Math.floor(seedNum % 50);
    for (let offset = 0; offset < MAP_SIZE * MAP_SIZE; offset++) {
      const idx = (offset + scanOffset) % (MAP_SIZE * MAP_SIZE);
      const x = Math.floor(idx / MAP_SIZE);
      const z = idx % MAP_SIZE;
      
      if (x > 3 && z > 3 && x < MAP_SIZE - 2 && z < MAP_SIZE - 2) {
        if (grid[x][z] === 0) {
          grid[x][z] = 4; // Stairs!
          stairsPlaced = true;
          break;
        }
      }
    }
    if (!stairsPlaced) {
      grid[MAP_SIZE - 3][MAP_SIZE - 3] = 4; // Fallback
    }

    // Place Wall Window (5) directly on the starting lobby left boundary for immediate visibility
    grid[0][2] = 5;

    // Place Floor Window (6) directly in the starting lobby floor for immediate visibility
    grid[2][2] = 6;

    mapGridRef.current = grid;

    // 3. Procedural Materials
    const wallMaps = createProceduralMaps(theme.wallTexture, theme.wallColor, true);
    const floorMaps = createProceduralMaps(theme.floorTexture, theme.floorColor, false);
    const ceilMaps = createProceduralMaps(theme.ceilingTexture, theme.ceilingColor, false);

    // Make textures repeat correctly
    wallMaps.map.repeat.set(1, 1);
    wallMaps.normalMap.repeat.set(1, 1);
    wallMaps.roughnessMap.repeat.set(1, 1);

    floorMaps.map.repeat.set(1.5, 1.5);
    floorMaps.normalMap.repeat.set(1.5, 1.5);
    floorMaps.roughnessMap.repeat.set(1.5, 1.5);

    ceilMaps.map.repeat.set(1.5, 1.5);
    ceilMaps.normalMap.repeat.set(1.5, 1.5);
    ceilMaps.roughnessMap.repeat.set(1.5, 1.5);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallMaps.map,
      normalMap: wallMaps.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: wallMaps.roughnessMap,
      metalness: theme.wallTexture === 'metal' ? 0.85 : 0.05,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorMaps.map,
      normalMap: floorMaps.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughnessMap: floorMaps.roughnessMap,
      metalness: theme.floorTexture === 'water' ? 0.35 : 0.05,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      map: ceilMaps.map,
      normalMap: ceilMaps.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: ceilMaps.roughnessMap,
    });

    // 4. Construct Room Geometries
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, 3.5, CELL_SIZE);
    
    
    // Instanced or Grouped meshes
    const mazeGroup = new THREE.Group();
    scene.add(mazeGroup);

    // Populate water cells set based on deterministic seed noise if theme is poolrooms
    waterCellsRef.current = new Set();
    if (theme.floorTexture === 'water') {
      for (let x = 0; x < MAP_SIZE; x++) {
        for (let z = 0; z < MAP_SIZE; z++) {
          if (grid[x][z] === 0) {
            const val = Math.abs(Math.sin(x * 79.19 + z * 104.729));
            if (val < 0.44 && (x !== 1 || z !== 1)) {
              waterCellsRef.current.add(`${x},${z}`);
            }
          }
        }
      }
    }

    // Floor and Ceiling planes
    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * CELL_SIZE, MAP_SIZE * CELL_SIZE);

    if (theme.floorTexture === 'water') {
      const tileGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
      const sideWallGeo = new THREE.PlaneGeometry(CELL_SIZE, 0.6);
      
      const waterGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: '#1a5f6e',
        transparent: true,
        opacity: 0.72,
        roughness: 0.05,
        metalness: 0.15,
        transmission: 0.82,
        ior: 1.333,
      });

      for (let x = 0; x < MAP_SIZE; x++) {
        for (let z = 0; z < MAP_SIZE; z++) {
          if (grid[x][z] !== 0) continue; // wall cell
          
          const posX = x * CELL_SIZE;
          const posZ = z * CELL_SIZE;
          const isWater = waterCellsRef.current.has(`${x},${z}`);

          if (!isWater) {
            // Dry walkway tile
            const cellFloor = new THREE.Mesh(tileGeo, floorMat);
            cellFloor.rotation.x = -Math.PI / 2;
            cellFloor.position.set(posX, 0, posZ);
            cellFloor.receiveShadow = true;
            mazeGroup.add(cellFloor);
          } else {
            // Water cell: recessed bottom tile
            const cellBottom = new THREE.Mesh(tileGeo, floorMat);
            cellBottom.rotation.x = -Math.PI / 2;
            cellBottom.position.set(posX, -0.6, posZ);
            cellBottom.receiveShadow = true;
            mazeGroup.add(cellBottom);

            // Water surface
            const waterMesh = new THREE.Mesh(waterGeo, waterMat);
            waterMesh.rotation.x = -Math.PI / 2;
            waterMesh.position.set(posX, -0.08, posZ);
            mazeGroup.add(waterMesh);

            // Side walls to seal the cavity
            const dirs = [
              { dx: -1, dz: 0, rotY: Math.PI / 2, posXOffset: -CELL_SIZE / 2, posZOffset: 0 },
              { dx: 1, dz: 0, rotY: -Math.PI / 2, posXOffset: CELL_SIZE / 2, posZOffset: 0 },
              { dx: 0, dz: -1, rotY: Math.PI, posXOffset: 0, posZOffset: -CELL_SIZE / 2 },
              { dx: 0, dz: 1, rotY: 0, posXOffset: 0, posZOffset: CELL_SIZE / 2 }
            ];

            dirs.forEach(d => {
              const nx = x + d.dx;
              const nz = z + d.dz;
              const isAdjacentDry = (nx < 0 || nx >= MAP_SIZE || nz < 0 || nz >= MAP_SIZE || grid[nx][nz] !== 0 || !waterCellsRef.current.has(`${nx},${nz}`));
              
              if (isAdjacentDry) {
                const side = new THREE.Mesh(sideWallGeo, floorMat);
                side.position.set(posX + d.posXOffset, -0.3, posZ + d.posZOffset);
                side.rotation.y = d.rotY;
                side.receiveShadow = true;
                mazeGroup.add(side);
              }
            });

            // Bridge Spawning: if opposite sides are dry, spawn an arched walkway bridge
            const hasLeftDry = (x > 0 && !waterCellsRef.current.has(`${x - 1},${z}`) && grid[x - 1][z] === 0);
            const hasRightDry = (x < MAP_SIZE - 1 && !waterCellsRef.current.has(`${x + 1},${z}`) && grid[x + 1][z] === 0);
            const hasBackDry = (z > 0 && !waterCellsRef.current.has(`${x},${z - 1}`) && grid[x][z - 1] === 0);
            const hasFrontDry = (z < MAP_SIZE - 1 && !waterCellsRef.current.has(`${x},${z + 1}`) && grid[x][z + 1] === 0);

            const isHorizontalBridge = hasLeftDry && hasRightDry;
            const isVerticalBridge = hasBackDry && hasFrontDry;

            if (isHorizontalBridge || isVerticalBridge) {
              const bridgeGroup = new THREE.Group();
              const woodMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.9 });
              const railMat = new THREE.MeshStandardMaterial({ color: '#3d2b1f', roughness: 0.8 });

              // Arch plank
              const archGeo = new THREE.BoxGeometry(CELL_SIZE + 0.1, 0.08, 0.9);
              const arch = new THREE.Mesh(archGeo, woodMat);
              arch.position.y = 0.08;
              bridgeGroup.add(arch);

              // Hand rails
              const railL = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE + 0.1, 0.06, 0.06), railMat);
              railL.position.set(0, 0.45, -0.42);
              const railR = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE + 0.1, 0.06, 0.06), railMat);
              railR.position.set(0, 0.45, 0.42);
              bridgeGroup.add(railL, railR);

              // Rail posts
              for (let offset = -CELL_SIZE / 2 + 0.2; offset <= CELL_SIZE / 2 - 0.2; offset += CELL_SIZE / 3) {
                const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), railMat);
                postL.position.set(offset, 0.225, -0.42);
                const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), railMat);
                postR.position.set(offset, 0.225, 0.42);
                bridgeGroup.add(postL, postR);
              }

              bridgeGroup.position.set(posX, 0, posZ);
              if (isVerticalBridge) {
                bridgeGroup.rotation.y = Math.PI / 2;
              }
              mazeGroup.add(bridgeGroup);
            }
          }
        }
      }
    } else {
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set((MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, 0, (MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
      floorMesh.receiveShadow = true;
      mazeGroup.add(floorMesh);
    }

    const ceilMesh = new THREE.Mesh(floorGeo, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set((MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, 3.5, (MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
    ceilMesh.receiveShadow = true;
    mazeGroup.add(ceilMesh);

    // Reset doors and steam particles lists
    doorsRef.current = [];
    steamParticlesRef.current = [];

    // Door and tree materials
    const isLobbyTheme = theme.name.toLowerCase().includes('lobby');
    const doorFrameMat = new THREE.MeshStandardMaterial({ 
      color: isLobbyTheme ? '#7a8a99' : '#2d2319', 
      metalness: isLobbyTheme ? 0.7 : 0.0,
      roughness: isLobbyTheme ? 0.4 : 0.8 
    });
    const doorPanelMat = isLobbyTheme 
      ? new THREE.MeshPhysicalMaterial({ 
          color: '#e0f7fa', 
          transparent: true, 
          opacity: 0.4, 
          transmission: 0.9, 
          roughness: 0.1, 
          metalness: 0.1 
        }) 
      : new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.9, metalness: 0.1 });
    const handleMat = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.8, roughness: 0.2 });

    const leafMat = new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9 });

    // Setup light fixtures list and panel geometry
    const lightFixtures: THREE.PointLight[] = [];
    const ceilingLightsList: LightState[] = [];
    const lightPanelGeo = new THREE.PlaneGeometry(1.2, 1.2);

    const isPoolTheme = theme.name.toLowerCase().includes('pool');
    const trimMat = new THREE.MeshStandardMaterial({
      color: isPoolTheme ? '#cfd6df' : '#2e1e12', // light vinyl or dark wood
      roughness: isPoolTheme ? 0.35 : 0.7,
      metalness: isPoolTheme ? 0.1 : 0.0,
    });

    const isWalkable = (cx: number, cz: number) => {
      if (cx < 0 || cx >= MAP_SIZE || cz < 0 || cz >= MAP_SIZE) return false;
      return grid[cx][cz] === 0 || grid[cx][cz] === 3;
    };

    const trimH = 0.12;
    const trimThick = 0.025;

    // Build grid cells once
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        const posX = x * CELL_SIZE;
        const posZ = z * CELL_SIZE;

        if (grid[x][z] === 1) {
          // Wall cube
          const mesh = new THREE.Mesh(wallGeo, wallMat);
          mesh.position.set(posX, 3.5 / 2, posZ);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mazeGroup.add(mesh);

          // Spawn baseboards on visible faces
          if (isWalkable(x, z + 1)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, trimH, trimThick), trimMat);
            b.position.set(posX, trimH / 2, posZ + CELL_SIZE / 2 + trimThick / 2);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
          if (isWalkable(x, z - 1)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, trimH, trimThick), trimMat);
            b.position.set(posX, trimH / 2, posZ - CELL_SIZE / 2 - trimThick / 2);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
          if (isWalkable(x - 1, z)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimH, CELL_SIZE), trimMat);
            b.position.set(posX - CELL_SIZE / 2 - trimThick / 2, trimH / 2, posZ);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
          if (isWalkable(x + 1, z)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimH, CELL_SIZE), trimMat);
            b.position.set(posX + CELL_SIZE / 2 + trimThick / 2, trimH / 2, posZ);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
        } else if (grid[x][z] === 2) {
          // Irregular large columns matching the user picture
          const isWideX = (x + z) % 2 === 0;
          const colW = isWideX ? 2.4 : 1.6;
          const colD = isWideX ? 1.6 : 2.4;
          const colGeo = new THREE.BoxGeometry(colW, 3.5, colD);

          const mesh = new THREE.Mesh(colGeo, wallMat);
          mesh.position.set(posX, 3.5 / 2, posZ);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mazeGroup.add(mesh);

          // Spawn baseboards on visible faces
          if (isWalkable(x, z + 1)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(colW, trimH, trimThick), trimMat);
            b.position.set(posX, trimH / 2, posZ + colD / 2 + trimThick / 2);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
          if (isWalkable(x, z - 1)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(colW, trimH, trimThick), trimMat);
            b.position.set(posX, trimH / 2, posZ - colD / 2 - trimThick / 2);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
          if (isWalkable(x - 1, z)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimH, colD), trimMat);
            b.position.set(posX - colW / 2 - trimThick / 2, trimH / 2, posZ);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
          if (isWalkable(x + 1, z)) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimH, colD), trimMat);
            b.position.set(posX + colW / 2 + trimThick / 2, trimH / 2, posZ);
            b.castShadow = true; b.receiveShadow = true; mazeGroup.add(b);
          }
        } else if (grid[x][z] === 3) {
          // Render a realistic vertical door centered in the cell!
          const doorGroup = new THREE.Group();
          doorGroup.position.set(posX, 0, posZ);

          const doorWidth = 1.2;
          const doorHeight = 2.2;
          const wallHeight = 3.5;

          // 1. Left partition wall panel
          const wallW = (CELL_SIZE - doorWidth) / 2; // (4.0 - 1.2) / 2 = 1.4m
          const wallLGeo = new THREE.BoxGeometry(wallW, wallHeight, 0.25);
          const wallL = new THREE.Mesh(wallLGeo, wallMat);
          wallL.position.set(-CELL_SIZE / 2 + wallW / 2, wallHeight / 2, 0);
          wallL.castShadow = true;
          wallL.receiveShadow = true;
          doorGroup.add(wallL);

          // 2. Right partition wall panel
          const wallR = new THREE.Mesh(wallLGeo, wallMat);
          wallR.position.set(CELL_SIZE / 2 - wallW / 2, wallHeight / 2, 0);
          wallR.castShadow = true;
          wallR.receiveShadow = true;
          doorGroup.add(wallR);

          // 3. Top transom header wall panel (above the door)
          const headerH = wallHeight - doorHeight; // 3.5 - 2.2 = 1.3m
          const wallHeaderGeo = new THREE.BoxGeometry(doorWidth, headerH, 0.25);
          const wallHeader = new THREE.Mesh(wallHeaderGeo, wallMat);
          wallHeader.position.set(0, doorHeight + headerH / 2, 0);
          wallHeader.castShadow = true;
          wallHeader.receiveShadow = true;
          doorGroup.add(wallHeader);

          // 4. Door Frame (timber trim)
          const frameMat = doorFrameMat;
          const postGeo = new THREE.BoxGeometry(0.08, doorHeight, 0.28);
          const postL = new THREE.Mesh(postGeo, frameMat);
          postL.position.set(-doorWidth / 2 - 0.04, doorHeight / 2, 0);
          const postR = new THREE.Mesh(postGeo, frameMat);
          postR.position.set(doorWidth / 2 + 0.04, doorHeight / 2, 0);
          
          const frameHeaderGeo = new THREE.BoxGeometry(doorWidth + 0.16, 0.08, 0.28);
          const frameHeader = new THREE.Mesh(frameHeaderGeo, frameMat);
          frameHeader.position.set(0, doorHeight + 0.04, 0);

          doorGroup.add(postL);
          doorGroup.add(postR);
          doorGroup.add(frameHeader);

          // 5. Swing Door Panel
          const swingGroup = new THREE.Group();
          swingGroup.position.set(-doorWidth / 2, 0, 0); // pivot at left frame post

          const panelW = doorWidth - 0.04;
          const panelH = doorHeight - 0.04;
          const panelGeo = new THREE.BoxGeometry(panelW, panelH, 0.05);
          const panelMesh = new THREE.Mesh(panelGeo, doorPanelMat);
          panelMesh.position.set(panelW / 2, panelH / 2, 0);
          panelMesh.castShadow = true;
          swingGroup.add(panelMesh);

          // 6. Door Knob assembly
          const knobBackplateGeo = new THREE.BoxGeometry(0.05, 0.15, 0.01);
          const knobBackplateL = new THREE.Mesh(knobBackplateGeo, handleMat);
          knobBackplateL.position.set(panelW - 0.12, 1.0, 0.03);
          swingGroup.add(knobBackplateL);
          const knobBackplateR = new THREE.Mesh(knobBackplateGeo, handleMat);
          knobBackplateR.position.set(panelW - 0.12, 1.0, -0.03);
          swingGroup.add(knobBackplateR);

          const knobSphereGeo = new THREE.SphereGeometry(0.04, 12, 12);
          const knobSphereL = new THREE.Mesh(knobSphereGeo, handleMat);
          knobSphereL.position.set(panelW - 0.12, 1.0, 0.06);
          swingGroup.add(knobSphereL);
          const knobSphereR = new THREE.Mesh(knobSphereGeo, handleMat);
          knobSphereR.position.set(panelW - 0.12, 1.0, -0.06);
          swingGroup.add(knobSphereR);

          doorGroup.add(swingGroup);
          mazeGroup.add(doorGroup);

          doorsRef.current.push({
            x,
            z,
            isOpen: false,
            angle: 0,
            group: swingGroup,
          });
        } else if (grid[x][z] === 4) {
          // Render procedural staircase
          const stairsGroup = new THREE.Group();
          stairsGroup.position.set(posX, 0, posZ);

          const numSteps = 12;
          const stepHeight = 3.5 / numSteps;
          const stepDepth = CELL_SIZE / numSteps;
          const stepWidth = 2.0; // width of steps
          const stepMat = wallMat; // use matching wall/concrete material

          for (let i = 0; i < numSteps; i++) {
            const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight * (i + 1), stepDepth);
            const stepMesh = new THREE.Mesh(stepGeo, stepMat);
            stepMesh.position.set(
              0, 
              (stepHeight * (i + 1)) / 2, 
              -CELL_SIZE / 2 + i * stepDepth + stepDepth / 2
            );
            stepMesh.castShadow = true;
            stepMesh.receiveShadow = true;
            stairsGroup.add(stepMesh);
          }

          // Add basic railings on the sides
          const railMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.5 });
          const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8);

          for (let i = 0; i < numSteps; i += 3) {
            const yOffset = stepHeight * (i + 1);
            const zOffset = -CELL_SIZE / 2 + i * stepDepth + stepDepth / 2;

            const postL = new THREE.Mesh(postGeo, railMat);
            postL.position.set(-stepWidth / 2 + 0.05, yOffset + 0.5, zOffset);
            stairsGroup.add(postL);

            const postR = new THREE.Mesh(postGeo, railMat);
            postR.position.set(stepWidth / 2 - 0.05, yOffset + 0.5, zOffset);
            stairsGroup.add(postR);
          }

          // Continuous slanted top handrails connecting the posts
          const run = (numSteps - 1) * stepDepth;
          const rise = (numSteps - 1) * stepHeight;
          const length = Math.sqrt(run * run + rise * rise);
          const pitch = Math.atan2(rise, run);

          const zCenter = (-CELL_SIZE / 2 + (numSteps - 1) * stepDepth / 2) + stepDepth / 2;
          const yCenter = (stepHeight * 1 + stepHeight * numSteps) / 2 + 1.0;

          const leftHandrail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 8), railMat);
          leftHandrail.position.set(-stepWidth / 2 + 0.05, yCenter, zCenter);
          leftHandrail.rotation.x = Math.PI / 2 - pitch;
          leftHandrail.castShadow = true;
          stairsGroup.add(leftHandrail);

          const rightHandrail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 8), railMat);
          rightHandrail.position.set(stepWidth / 2 - 0.05, yCenter, zCenter);
          rightHandrail.rotation.x = Math.PI / 2 - pitch;
          rightHandrail.castShadow = true;
          stairsGroup.add(rightHandrail);

          mazeGroup.add(stairsGroup);
        } else if (grid[x][z] === 5) {
          // Wall Window Portal
          const windowGroup = new THREE.Group();
          windowGroup.position.set(posX, 0, posZ);

          // Detect adjacent walkable corridor direction to face the window towards the corridor
          let angle = 0;
          let offX = 0;
          let offZ = 0;
          if (x < MAP_SIZE - 1 && (grid[x+1][z] === 0 || grid[x+1][z] === 3 || grid[x+1][z] === 4)) {
            angle = -Math.PI / 2;
            offX = CELL_SIZE / 2 - 0.15;
          } else if (x > 0 && (grid[x-1][z] === 0 || grid[x-1][z] === 3 || grid[x-1][z] === 4)) {
            angle = Math.PI / 2;
            offX = -CELL_SIZE / 2 + 0.15;
          } else if (z < MAP_SIZE - 1 && (grid[x][z+1] === 0 || grid[x][z+1] === 3 || grid[x][z+1] === 4)) {
            angle = 0;
            offZ = CELL_SIZE / 2 - 0.15;
          } else if (z > 0 && (grid[x][z-1] === 0 || grid[x][z-1] === 3 || grid[x][z-1] === 4)) {
            angle = Math.PI;
            offZ = -CELL_SIZE / 2 + 0.15;
          }

          windowGroup.position.x += offX;
          windowGroup.position.z += offZ;
          windowGroup.rotation.y = angle;

          const frameMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 }); // wooden trim
          
          const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.4), frameMat);
          leftSide.position.set(-1.0, 3.5 / 2, 0);
          leftSide.castShadow = true;
          
          const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 0.4), frameMat);
          rightSide.position.set(1.0, 3.5 / 2, 0);
          rightSide.castShadow = true;

          const topHeader = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.4), frameMat);
          topHeader.position.set(0, 3.5 - 0.4, 0);
          topHeader.castShadow = true;
          
          const bottomHeader = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.4), frameMat);
          bottomHeader.position.set(0, 0.4, 0);
          bottomHeader.castShadow = true;

          // Glowing blue star window glass pane
          const glassGeo = new THREE.BoxGeometry(2.0, 3.5 - 1.6, 0.08);
          const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x00f0ff,
            emissive: 0x00aacc,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.7,
            roughness: 0.1,
            transmission: 0.9,
            thickness: 0.3
          });
          const glass = new THREE.Mesh(glassGeo, glassMat);
          glass.position.set(0, 3.5 / 2, 0);

          windowGroup.add(leftSide, rightSide, topHeader, bottomHeader, glass);
          mazeGroup.add(windowGroup);
        } else if (grid[x][z] === 6) {
          // Floor Window / Trapdoor Portal
          const windowGroup = new THREE.Group();
          windowGroup.position.set(posX, 0, posZ);

          const frameMat = new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8 }); // iron borders
          const tSize = 1.6;
          
          const bL = new THREE.Mesh(new THREE.BoxGeometry(tSize, 0.06, 0.1), frameMat); bL.position.set(0, 0.03, -tSize / 2 + 0.05);
          const bR = new THREE.Mesh(new THREE.BoxGeometry(tSize, 0.06, 0.1), frameMat); bR.position.set(0, 0.03, tSize / 2 - 0.05);
          const bA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, tSize - 0.2), frameMat); bA.position.set(-tSize / 2 + 0.05, 0.03, 0);
          const bB = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, tSize - 0.2), frameMat); bB.position.set(tSize / 2 - 0.05, 0.03, 0);

          // Glowing green glass trapdoor pane
          const glassGeo = new THREE.BoxGeometry(tSize - 0.2, 0.02, tSize - 0.2);
          const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x39ff14,
            emissive: 0x00ff66,
            emissiveIntensity: 1.8,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            transmission: 0.9,
            thickness: 0.3
          });
          const glass = new THREE.Mesh(glassGeo, glassMat);
          glass.position.set(0, 0.02, 0);

          windowGroup.add(bL, bR, bA, bB, glass);
          mazeGroup.add(windowGroup);
        } else if (grid[x][z] === 0) {
          // Render theme-specific floor and wall props inside walkable corridors
          const isLavaTheme = theme.name.includes('Boiler') || theme.name.includes('Underworld');
          const isSterileTheme = theme.name.includes('Sterile') || theme.name.includes('Ward');
          const isMetalTheme = theme.name.includes('Industrial') || theme.name.includes('Sector');
          const isFrozenTheme = theme.name.includes('Frozen') || theme.name.includes('Archive');
          const isCircusTheme = theme.name.includes('Funhouse') || theme.name.includes('Circus');
          const isGoldTheme = theme.name.includes('Golden') || theme.name.includes('Palace');
          const isTropicalTheme = theme.name.includes('Tropical');
          const isNatureTheme = theme.name.includes('Arbour');
          const isWaterTheme = theme.name.includes('Pool');
          const isArcadeTheme = theme.name.includes('Arcade') || theme.name.includes('Cyber');
          const isDarkVoid = theme.name.includes('Void') || theme.name.includes('Dark');
          const isDesertTheme = theme.name.includes('Desert') || theme.name.includes('Ruins');
          const isMatrixTheme = theme.name.includes('Matrix');

          const propRoll = Math.abs(Math.sin(x * 37.7 + z * 19.3 + seedNum) * 100) % 1;

          // Spawn props at ~15% of cells, avoiding start lobby
          if (propRoll > 0.85 && !(x === 1 && z === 1) && !(x === 1 && z === 2) && !(x === 2 && z === 1)) {
            const propGroup = new THREE.Group();
            propGroup.position.set(posX, 0, posZ);
            const itemIndex = (x + z) % 3;

            if (isTropicalTheme) {
              if (itemIndex === 0) {
                // Pile of Sand
                const sandMat = new THREE.MeshStandardMaterial({ 
                  color: theme.floorColor,
                  roughness: 0.95 
                });
                const moundGeo = new THREE.ConeGeometry(0.65, 0.35, 8);
                const mound = new THREE.Mesh(moundGeo, sandMat);
                mound.position.y = 0.175;
                propGroup.add(mound);
                
                const subMound = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.2, 8), sandMat);
                subMound.position.set(0.35, 0.1, -0.2);
                propGroup.add(subMound);
              } else if (itemIndex === 1) {
                // Coconut Drink
                const shellGeo = new THREE.SphereGeometry(0.24, 10, 10);
                const shellMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.85 }); // brown
                const shell = new THREE.Mesh(shellGeo, shellMat);
                shell.position.y = 0.24;
                propGroup.add(shell);

                const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 10);
                const rimMat = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.2 }); // white
                const rim = new THREE.Mesh(rimGeo, rimMat);
                rim.position.y = 0.45;
                propGroup.add(rim);

                const strawGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35, 4);
                const strawMat = new THREE.MeshBasicMaterial({ color: '#ff3b30' }); // red
                const straw = new THREE.Mesh(strawGeo, strawMat);
                straw.position.set(0.08, 0.54, 0.08);
                straw.rotation.z = -Math.PI / 6;
                straw.rotation.x = Math.PI / 12;
                propGroup.add(straw);

                const umbrellaPole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4), new THREE.MeshStandardMaterial({ color: '#dfcca4' }));
                umbrellaPole.position.set(-0.07, 0.51, -0.07);
                umbrellaPole.rotation.z = Math.PI / 5;
                
                const umbrellaTop = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.06, 8), new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.4 }));
                umbrellaTop.position.set(-0.13, 0.61, -0.07);
                umbrellaTop.rotation.z = Math.PI / 5;
                propGroup.add(umbrellaPole, umbrellaTop);
              } else {
                // Palm tree
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 8), trunkMat);
                trunk.position.y = 1.2; propGroup.add(trunk);
                for (let i = 0; i < 6; i++) {
                  const angle = (i / 6) * Math.PI * 2;
                  const frond = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.25), leafMat);
                  frond.position.set(Math.cos(angle) * 0.6, 2.3, Math.sin(angle) * 0.6);
                  frond.rotation.set(0, angle, Math.PI / 8);
                  propGroup.add(frond);
                }
              }
            } else if (isNatureTheme) {
              if (itemIndex === 0) {
                // Beach Ball
                const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.1 }));
                ball.position.y = 0.3;
                const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
                stripe.position.y = 0.3;
                propGroup.add(ball, stripe);
              } else if (itemIndex === 1) {
                // Deck Chair
                const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0xd7ccc8 }));
                frame.rotation.x = Math.PI / 5; frame.position.set(0, 0.18, 0);
                const fabric = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.015, 0.65), new THREE.MeshStandardMaterial({ color: 0x00bcd4 }));
                fabric.rotation.x = Math.PI / 5; fabric.position.set(0, 0.2, 0);
                propGroup.add(frame, fabric);
              } else {
                // Shrub
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 8), trunkMat);
                trunk.position.y = 0.5;
                const foliage = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), leafMat);
                foliage.position.y = 1.5;
                propGroup.add(trunk, foliage);
              }
            }
            else if (isLavaTheme) {
              if (itemIndex === 0) {
                const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 10), new THREE.MeshStandardMaterial({ color: 0xff3300, metalness: 0.8 }));
                wheel.position.set(-1.85, 1.5, 0); wheel.rotation.y = Math.PI / 2;
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), new THREE.MeshStandardMaterial({ color: 0xff3300 }));
                rod.position.set(-1.95, 1.5, 0); rod.rotation.z = Math.PI / 2;
                propGroup.add(wheel, rod);
              } else if (itemIndex === 1) {
                const coal = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xff3300, emissiveIntensity: 1.5 }));
                coal.position.y = 0.2; propGroup.add(coal);
              } else {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xe65100, metalness: 0.8 }));
                barrel.position.y = 0.45; propGroup.add(barrel);
              }
            }
            else if (isSterileTheme) {
              if (itemIndex === 0) {
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9 }));
                pole.position.y = 0.9;
                const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.06), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, transmission: 0.8 }));
                bag.position.set(0.08, 1.6, 0); propGroup.add(pole, bag);
              } else if (itemIndex === 1) {
                const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7 }));
                cabinet.position.y = 0.8; propGroup.add(cabinet);
              } else {
                const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.65, 8), new THREE.MeshStandardMaterial({ color: 0x0288d1 }));
                bin.position.y = 0.3; propGroup.add(bin);
              }
            }
            else if (isMetalTheme) {
              if (itemIndex === 0) {
                // Pipe with Steam
                const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, CELL_SIZE, 8), new THREE.MeshStandardMaterial({ color: 0x6e635c, metalness: 0.85, roughness: 0.4 }));
                pipe.rotation.x = Math.PI / 2; pipe.position.set(-1.92, 2.4, 0); propGroup.add(pipe);

                const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xaa8877, metalness: 0.9 }));
                valve.position.set(-1.8, 2.3, 0);
                valve.rotation.x = Math.PI / 3;
                propGroup.add(valve);

                // Spawn steam particles
                const steamGeo = new THREE.SphereGeometry(0.06, 4, 4);
                const steamMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.16 });
                for (let s = 0; s < 8; s++) {
                  const sMesh = new THREE.Mesh(steamGeo, steamMat);
                  const sx = posX - 1.8;
                  const sy = 2.3;
                  const sz = posZ;
                  sMesh.position.set(sx, sy, sz);
                  scene.add(sMesh);
                  
                  steamParticlesRef.current.push({
                    mesh: sMesh,
                    vx: 0.25 + Math.random() * 0.35, // blow out away from wall
                    vy: -0.15 + Math.random() * 0.35, // drift
                    vz: (Math.random() - 0.5) * 0.4,
                    life: Math.random() * 1.5,
                    maxLife: 1.5 + Math.random() * 1.5,
                    ox: sx,
                    oy: sy,
                    oz: sz
                  });
                }
              } else if (itemIndex === 1) {
                // Garbage Dumpster embedded in wall and floor
                const dumpsterGroup = new THREE.Group();
                
                const dumpBodyGeo = new THREE.BoxGeometry(0.75, 0.65, 0.95);
                const dumpBodyMat = new THREE.MeshStandardMaterial({ color: '#2b5e35', roughness: 0.8 }); // dark green
                const dumpBody = new THREE.Mesh(dumpBodyGeo, dumpBodyMat);
                dumpBody.position.set(-1.65, 0.325, 0);
                dumpsterGroup.add(dumpBody);

                const lidGeo = new THREE.BoxGeometry(0.78, 0.04, 0.48);
                const lidMat = new THREE.MeshStandardMaterial({ color: '#222222', roughness: 0.9 });
                const lid = new THREE.Mesh(lidGeo, lidMat);
                lid.position.set(-1.65, 0.65, 0.24);
                lid.rotation.x = Math.PI / 6;
                dumpsterGroup.add(lid);

                const wheelMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9 });
                const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6), wheelMat);
                w1.position.set(-1.4, 0.04, 0.35); w1.rotation.z = Math.PI / 2;
                const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6), wheelMat);
                w2.position.set(-1.4, 0.04, -0.35); w2.rotation.z = Math.PI / 2;
                dumpsterGroup.add(w1, w2);

                const bagMat = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.1, metalness: 0.2 }); // black plastic
                const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 5), bagMat);
                b1.position.set(-1.15, 0.18, 0.38);
                const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 5), bagMat);
                b2.position.set(-1.22, 0.16, 0.24);
                dumpsterGroup.add(b1, b2);

                propGroup.add(dumpsterGroup);
              } else {
                // HVAC System
                const hvacGroup = new THREE.Group();

                const cabinetGeo = new THREE.BoxGeometry(0.8, 1.0, 1.1);
                const cabinetMat = new THREE.MeshStandardMaterial({ color: '#7a8a99', roughness: 0.5, metalness: 0.65 });
                const cabinet = new THREE.Mesh(cabinetGeo, cabinetMat);
                cabinet.position.set(-1.6, 0.5, 0);
                hvacGroup.add(cabinet);

                const fanCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 10), new THREE.MeshStandardMaterial({ color: '#444444', metalness: 0.8 }));
                fanCasing.position.set(-1.6, 1.025, 0);
                hvacGroup.add(fanCasing);

                const bladeMat = new THREE.MeshStandardMaterial({ color: '#111111', metalness: 0.9 });
                for (let i = 0; i < 3; i++) {
                  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.01, 0.06), bladeMat);
                  blade.position.set(-1.6, 1.04, 0);
                  blade.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 6;
                  hvacGroup.add(blade);
                }

                const slotMat = new THREE.MeshBasicMaterial({ color: '#111111' });
                for (let sy = 0.25; sy <= 0.75; sy += 0.12) {
                  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.65), slotMat);
                  slot.position.set(-1.19, sy, 0);
                  hvacGroup.add(slot);
                }

                const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 5), new THREE.MeshStandardMaterial({ color: '#222222', roughness: 0.15 }));
                bag.position.set(-1.1, 0.2, 0.45);
                hvacGroup.add(bag);

                propGroup.add(hvacGroup);
              }
            }
            else if (isFrozenTheme) {
              if (itemIndex === 0) {
                const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.0, 6), new THREE.MeshPhysicalMaterial({ color: 0x88ccff, transparent: true, transmission: 0.9 }));
                icicle.rotation.x = Math.PI; icicle.position.y = 2.9; propGroup.add(icicle);
              } else if (itemIndex === 1) {
                const iceBlock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshPhysicalMaterial({ color: 0x00bcd4, transmission: 0.9 }));
                iceBlock.position.y = 0.3; propGroup.add(iceBlock);
              } else {
                const snowMound = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
                snowMound.position.y = 0.175; propGroup.add(snowMound);
              }
            }
            else if (isCircusTheme) {
              if (itemIndex === 0) {
                const colors = [0xd32f2f, 0xfbc02d, 0x0d47a1, 0x388e3c];
                const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: colors[(x + z) % colors.length], roughness: 0.1 }));
                balloon.position.y = 1.35;
                const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.35, 4), new THREE.MeshBasicMaterial({ color: 0x888888 }));
                string.position.y = 0.675;
                propGroup.add(balloon, string);
              } else if (itemIndex === 1) {
                const toyBox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0xd32f2f }));
                toyBox.position.y = 0.225; propGroup.add(toyBox);
              } else {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
                post.position.y = 0.9; propGroup.add(post);
                for (let sy = 0.3; sy < 1.8; sy += 0.4) {
                  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.015, 4, 8), new THREE.MeshBasicMaterial({ color: 0xd32f2f }));
                  stripe.position.set(0, sy, 0); stripe.rotation.x = Math.PI / 2;
                  propGroup.add(stripe);
                }
              }
            }
            else if (isGoldTheme) {
              if (itemIndex === 0) {
                const chest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9 }));
                chest.position.y = 0.25;
                const bandL = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.52, 0.1), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
                bandL.position.set(0, 0.25, -0.15);
                const bandR = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.52, 0.1), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
                bandR.position.set(0, 0.25, 0.15);
                propGroup.add(chest, bandL, bandR);
              } else if (itemIndex === 1) {
                const barGeo = new THREE.BoxGeometry(0.4, 0.12, 0.18);
                const barMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95 });
                const b1 = new THREE.Mesh(barGeo, barMat); b1.position.set(-0.15, 0.06, 0);
                const b2 = new THREE.Mesh(barGeo, barMat); b2.position.set(0.15, 0.06, 0);
                const b3 = new THREE.Mesh(barGeo, barMat); b3.position.set(0, 0.18, 0);
                propGroup.add(b1, b2, b3);
              } else {
                const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9 }));
                vase.position.y = 0.4; propGroup.add(vase);
              }
            }
            else if (isWaterTheme) {
              if (itemIndex === 0) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff3b30 }));
                ring.rotation.x = Math.PI / 2; ring.position.y = 0.08;
                const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff })); b1.position.set(0.3, 0.08, 0);
                const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff })); b2.position.set(-0.3, 0.08, 0);
                propGroup.add(ring, b1, b2);
              } else if (itemIndex === 1) {
                const ladder = new THREE.Group();
                const railMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 });
                const rL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6), railMat); rL.position.set(-0.3, 0.9, -1.9);
                const rR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6), railMat); rR.position.set(0.3, 0.9, -1.9);
                ladder.add(rL, rR);
                for (let r = 0.3; r < 1.8; r += 0.4) {
                  const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), railMat);
                  rung.position.set(0, r, -1.9); rung.rotation.z = Math.PI / 2;
                  ladder.add(rung);
                }
                propGroup.add(ladder);
              } else {
                const grate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }));
                grate.position.y = 0.0075; propGroup.add(grate);
              }
            }
            else if (isArcadeTheme) {
              if (itemIndex === 0) {
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), new THREE.MeshStandardMaterial({ color: 0x151515 }));
                body.position.y = 0.7;
                const screen = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.35, 0.05), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
                screen.position.set(0, 0.9, 0.25);
                const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xd633ff }));
                marquee.position.set(0, 1.25, 0.25);
                propGroup.add(body, screen, marquee);
              } else if (itemIndex === 1) {
                const pad = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 0.75), new THREE.MeshStandardMaterial({ color: 0x252525, metalness: 0.6 }));
                pad.position.y = 0.01;
                const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.022, 0.18), new THREE.MeshBasicMaterial({ color: 0x39ff14 }));
                arrow.position.set(0, 0.01, 0.22);
                propGroup.add(pad, arrow);
              } else {
                const colors = [0xff007f, 0x00f0ff, 0x39ff14];
                const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), new THREE.MeshBasicMaterial({ color: colors[(x + z) % colors.length] }));
                stick.position.set(-1.9, 1.2, 0); propGroup.add(stick);
              }
            }
            else if (isDarkVoid) {
              if (itemIndex === 0) {
                const obelisk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), new THREE.MeshBasicMaterial({ color: 0x001100 }));
                obelisk.position.y = 1.0;
                const glint = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
                glint.position.set(0, 1.5, 0); propGroup.add(obelisk, glint);
              } else if (itemIndex === 1) {
                const chains = new THREE.Group();
                const chainMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9 });
                for (let c = -0.3; c <= 0.3; c += 0.15) {
                  const link = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 8), chainMat);
                  link.position.set(c, 0.02, c * 0.5); link.rotation.y = c * 5;
                  chains.add(link);
                }
                propGroup.add(chains);
              } else {
                const boneMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
                const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), boneMat); b1.position.set(0, 0.05, 0); b1.rotation.y = Math.PI / 4;
                const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), boneMat); b2.position.set(0.05, 0.05, -0.05); b2.rotation.y = -Math.PI / 3;
                propGroup.add(b1, b2);
              }
            }
            else if (isDesertTheme) {
              if (itemIndex === 0) {
                const cactus = new THREE.Group();
                const cacMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), cacMat); trunk.position.y = 0.6; cactus.add(trunk);
                const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), cacMat); armL.position.set(-0.15, 0.8, 0); armL.rotation.z = Math.PI / 2;
                const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), cacMat); armR.position.set(0.15, 0.7, 0); armR.rotation.z = -Math.PI / 2;
                cactus.add(armL, armR); propGroup.add(cactus);
              } else if (itemIndex === 1) {
                const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xa1887f }));
                urn.position.y = 0.35; propGroup.add(urn);
              } else {
                const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0xbcaaa4 }));
                block.position.y = 0.2; block.rotation.y = Math.PI / 6; propGroup.add(block);
              }
            }
            else if (isMatrixTheme) {
              if (itemIndex === 0) {
                const consoleDesk = new THREE.Group();
                const desk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
                desk.position.y = 0.375; consoleDesk.add(desk);
                const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.05), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
                screen.position.set(0, 0.88, 0.05); consoleDesk.add(screen);
                propGroup.add(consoleDesk);
              } else if (itemIndex === 1) {
                const vent = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), new THREE.MeshStandardMaterial({ color: 0x2e3b2e, metalness: 0.8 }));
                vent.position.y = 0.01; propGroup.add(vent);
              } else {
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111 }));
                box.position.set(-1.95, 2.2, 0);
                const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
                bulb.position.set(-1.9, 2.2, 0); propGroup.add(box, bulb);
              }
            }
            else {
              const allowedProps = theme.props.filter((p: string) => ['desk', 'computer', 'chair', 'cooler', 'copier', 'coffee', 'cabinet'].includes(p));
              if (allowedProps.length > 0) {
                const selectedProp = allowedProps[(x + z) % allowedProps.length];
                
                if (selectedProp === 'desk' || selectedProp === 'computer') {
                  const deskGroup = new THREE.Group();
                  const woodMat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.7 });
                  
                  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.6), woodMat);
                  top.position.y = 0.68;
                  deskGroup.add(top);

                  const legMat = new THREE.MeshStandardMaterial({ color: '#111111', metalness: 0.8, roughness: 0.3 });
                  const legG = new THREE.CylinderGeometry(0.03, 0.03, 0.66, 4);
                  const coords = [
                    [-0.45, 0.3], [0.45, 0.3], [-0.45, -0.3], [0.45, -0.3]
                  ];
                  coords.forEach(c => {
                    const leg = new THREE.Mesh(legG, legMat);
                    leg.position.set(c[0], 0.33, c[1]);
                    deskGroup.add(leg);
                  });

                  if (selectedProp === 'computer') {
                    const compGroup = new THREE.Group();
                    const compMat = new THREE.MeshStandardMaterial({ color: '#222222', roughness: 0.6 });
                    const screenMat = new THREE.MeshBasicMaterial({ color: '#00ccff' });
                    
                    const base = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.14), compMat);
                    base.position.y = 0.71;
                    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4), compMat);
                    stand.position.set(0, 0.77, 0);
                    
                    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.03), compMat);
                    monitor.position.set(0, 0.94, 0);
                    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.24, 0.01), screenMat);
                    screen.position.set(0, 0.94, 0.016);
                    
                    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.1), new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.8 }));
                    kb.position.set(0, 0.706, 0.2);

                    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.9 }));
                    phone.position.set(0.32, 0.72, 0.12);
                    phone.rotation.y = -Math.PI / 8;

                    compGroup.add(base, stand, monitor, screen, kb, phone);
                    deskGroup.add(compGroup);
                  }

                  propGroup.add(deskGroup);
                } 
                else if (selectedProp === 'chair') {
                  const chairGroup = new THREE.Group();
                  const baseMat = new THREE.MeshStandardMaterial({ color: '#1f1f1f', metalness: 0.8, roughness: 0.4 });
                  const cushionMat = new THREE.MeshStandardMaterial({ color: '#1b365d', roughness: 0.65 });
                  
                  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), cushionMat);
                  seat.position.y = 0.45;
                  
                  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.05), cushionMat);
                  back.position.set(0, 0.7, -0.2);
                  
                  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), baseMat);
                  pole.position.y = 0.25;

                  const starBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 5), baseMat);
                  starBase.position.y = 0.08;

                  chairGroup.add(seat, back, pole, starBase);
                  propGroup.add(chairGroup);
                }
                else if (selectedProp === 'cooler') {
                  const coolerGroup = new THREE.Group();
                  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.5 });
                  const bottleMat = new THREE.MeshPhysicalMaterial({ 
                    color: '#4fc3f7', 
                    transparent: true, 
                    opacity: 0.65, 
                    transmission: 0.88, 
                    roughness: 0.1 
                  });
                  
                  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.7, 0.34), bodyMat);
                  stand.position.y = 0.35;
                  coolerGroup.add(stand);

                  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 8), bottleMat);
                  bottle.position.y = 0.91;
                  coolerGroup.add(bottle);

                  const dispenser = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 4), new THREE.MeshStandardMaterial({ color: '#f5f5f5', metalness: 0.4 }));
                  dispenser.position.set(0.18, 0.55, 0);
                  coolerGroup.add(dispenser);

                  const coldTab = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: '#007aff' }));
                  coldTab.position.set(0, 0.62, 0.18);
                  const hotTab = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
                  hotTab.position.set(-0.06, 0.62, 0.18);
                  coolerGroup.add(coldTab, hotTab);

                  propGroup.add(coolerGroup);
                }
                else if (selectedProp === 'copier') {
                  const copierGroup = new THREE.Group();
                  const copierMat = new THREE.MeshStandardMaterial({ color: '#cbcbcb', roughness: 0.6, metalness: 0.1 });
                  const screenMat = new THREE.MeshBasicMaterial({ color: '#39ff14' });
                  
                  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.55), copierMat);
                  body.position.y = 0.425;
                  copierGroup.add(body);

                  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.56), copierMat);
                  lid.position.set(0, 0.87, 0);
                  copierGroup.add(lid);

                  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.12), screenMat);
                  panel.position.set(0.2, 0.86, 0.22);
                  panel.rotation.x = -Math.PI / 10;
                  copierGroup.add(panel);

                  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.44), copierMat);
                  tray.position.set(-0.46, 0.5, 0);
                  tray.rotation.z = Math.PI / 12;
                  copierGroup.add(tray);

                  propGroup.add(copierGroup);
                }
                else if (selectedProp === 'coffee') {
                  const coffeeGroup = new THREE.Group();
                  const tableMat = new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.8 });
                  const machineMat = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.4, metalness: 0.3 });
                  const potMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, transmission: 0.9, roughness: 0.1 });
                  
                  const table = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.4), tableMat);
                  table.position.y = 0.3;
                  coffeeGroup.add(table);

                  const maker = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.22), machineMat);
                  maker.position.set(0, 0.78, 0);
                  coffeeGroup.add(maker);

                  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 6), potMat);
                  pot.position.set(0, 0.68, 0.05);
                  coffeeGroup.add(pot);

                  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 6), new THREE.MeshStandardMaterial({ color: '#3e2723', roughness: 0.1 }));
                  liquid.position.set(0, 0.65, 0.05);
                  coffeeGroup.add(liquid);

                  propGroup.add(coffeeGroup);
                }
                else if (selectedProp === 'cabinet') {
                  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.25, 0.5), new THREE.MeshStandardMaterial({ color: '#78909c', metalness: 0.7, roughness: 0.4 }));
                  cabinet.position.y = 0.625;
                  
                  const fileHandleMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', metalness: 0.9, roughness: 0.2 });
                  for (let hy = 0.25; hy <= 1.05; hy += 0.3) {
                    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.02), fileHandleMat);
                    handle.position.set(0, hy, 0.26);
                    cabinet.add(handle);
                  }

                  propGroup.add(cabinet);
                }
                else if (selectedProp === 'stapler') {
                  const standGroup = new THREE.Group();
                  const standMat = new THREE.MeshStandardMaterial({ color: '#444444', roughness: 0.7 });
                  
                  const table = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.65, 0.4), standMat);
                  table.position.y = 0.325;
                  standGroup.add(table);

                  const staplerGroup = new THREE.Group();
                  const redPlasticMat = new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.25 });
                  const metalMat = new THREE.MeshStandardMaterial({ color: '#cccccc', metalness: 0.9, roughness: 0.2 });

                  const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.04), metalMat);
                  base.position.y = 0.66;
                  
                  const topArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.04), redPlasticMat);
                  topArm.position.set(-0.01, 0.685, 0);
                  topArm.rotation.z = Math.PI / 18;
                  
                  staplerGroup.add(base, topArm);
                  standGroup.add(staplerGroup);
                  propGroup.add(standGroup);
                }
              } else {
                const trashCan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.5 }));
                trashCan.position.y = 0.25;
                propGroup.add(trashCan);
              }
            }

            // Apply slight random offset to keep placement natural and out of exact center
            const offsetX = ((Math.sin(x * 12.3) * 100) % 1) * 0.8;
            const offsetZ = ((Math.sin(z * 45.7) * 100) % 1) * 0.8;
            propGroup.position.x += offsetX;
            propGroup.position.z += offsetZ;

            // Enable shadow casting recursively on all prop meshes
            propGroup.traverse(child => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            mazeGroup.add(propGroup);
          }
        }
      }
    }

    // 5. Environmental Lighting Setup
    const ambientLight = new THREE.AmbientLight(
      theme.lightingStyle === 'matrix' ? 0x3ca649 : // glowing bright green phosphor ambient
      theme.lightingStyle === 'sunlight' ? 0xdcf0fa : // sky blue ambient
      theme.lightingStyle === 'red-alarm' ? 0x886e68 : // warmer/brighter rusty-orange ambient glow
      theme.lightingStyle === 'flashlight-only' ? 0x111111 : 0x666666,
      theme.lightingStyle === 'sunlight' ? 0.95 : 1.0
    );
    scene.add(ambientLight);

    // Directional subtle fog glow or bright sunlight
    let sunLight: THREE.DirectionalLight;
    if (theme.lightingStyle === 'sunlight') {
      sunLight = new THREE.DirectionalLight(0xfffce0, 1.8);
      sunLight.position.set(20, 45, 10);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 80;
      const d = 16;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0005;
    } else {
      sunLight = new THREE.DirectionalLight(0xffffff, 0.15);
      sunLight.position.set(10, 20, 10);
    }
    scene.add(sunLight);

    if (theme.lightingStyle !== 'flashlight-only' && theme.lightingStyle !== 'sunlight') {
      const intensity = theme.lightingStyle === 'red-alarm' ? 2.5 : theme.lightingStyle === 'white-sterile' ? 2.0 : 1.5;
      const color = theme.lightingStyle === 'red-alarm' ? 0xff0000 : 
                    theme.lightingStyle === 'neon' ? 0x00ffff : 
                    theme.lightingStyle === 'matrix' ? 0x39ff14 : 0xfffae0; // phosphor green!
      const glowColor = theme.lightingStyle === 'red-alarm' ? 0xff3333 : 
                        theme.lightingStyle === 'neon' ? 0x00f0ff : 
                        theme.lightingStyle === 'matrix' ? 0x66ff88 : 0xffffe0;

      for (let x = 1; x < MAP_SIZE - 1; x++) {
        for (let z = 1; z < MAP_SIZE - 1; z++) {
          if (grid[x][z] === 0 && x % 2 === 0 && z % 2 === 0) {
            const posX = x * CELL_SIZE;
            const posZ = z * CELL_SIZE;

            const localPanelMat = new THREE.MeshBasicMaterial({ color: glowColor, side: THREE.DoubleSide });
            const lightMesh = new THREE.Mesh(lightPanelGeo, localPanelMat);
            lightMesh.rotation.x = Math.PI / 2;
            lightMesh.position.set(posX, 3.48, posZ);
            scene.add(lightMesh);

            const light = new THREE.PointLight(color, intensity * 2.2, 12, 2.0);
            light.position.set(posX, 3.2, posZ);
            light.castShadow = false; 
            scene.add(light);
            lightFixtures.push(light);

            ceilingLightsList.push({
              light,
              panel: lightMesh,
              originalIntensity: intensity,
              flickerTicks: 0,
              flickerState: true
            });
          }
        }
      }
    }


    // 6. Spawn Flashlight (Spotlight) attached to camera and 3D Hammer tool
    scene.add(camera);

    const create3DHammer = () => {
      const hammerGroup = new THREE.Group();
      const handleMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8, metalness: 0.1 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.8 });
      const bandMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.7 });

      // Handle shaft (Z-aligned, running from Z=0 to Z=-0.42)
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), handleMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, -0.21);
      handle.castShadow = true;
      hammerGroup.add(handle);

      // Head (placed near the far end of the shaft)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14), headMat);
      head.position.set(0, 0, -0.38);
      head.castShadow = true;
      hammerGroup.add(head);

      // Claw
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), headMat);
      claw.position.set(0, 0.03, -0.38);
      hammerGroup.add(claw);

      // Band
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0, -0.31);
      hammerGroup.add(band);

      return hammerGroup;
    };

    const hammer = create3DHammer();
    // Rest position closer and slightly tilted in viewport
    hammer.position.set(0.18, -0.18, -0.35);
    hammer.rotation.set(-0.5, -Math.PI / 3, 0.2);
    hammer.visible = false; // Hidden by default until invoked
    camera.add(hammer);
    hammerRef.current = hammer;

    const flashlight = new THREE.SpotLight(0xffffff, 12.0, 28, Math.PI / 5.2, 0.6, 2.0);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    scene.add(flashlight);
    flashlightRef.current = flashlight;

    // 7. Spawn Theme Specific Props (Pipes, Cabinets, Lockers, Water puddles)
    const spawnProps = () => {
      breakablesRef.current = [];
      const metalMaterial = new THREE.MeshStandardMaterial({ color: '#555555', metalness: 0.8, roughness: 0.3 });
      
      if (theme.props.includes('pipe')) {
        // Exposed pipes running along ceiling corridors
        const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, CELL_SIZE * MAP_SIZE, 8);
        for (let i = 2; i < MAP_SIZE; i += 4) {
          const pipe = new THREE.Mesh(pipeGeo, metalMaterial);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set((CELL_SIZE * MAP_SIZE) / 2 - CELL_SIZE / 2, 3.2, i * CELL_SIZE);
          scene.add(pipe);
        }
      }

      if (theme.props.includes('locker')) {
        // Spawn standard gray lockers
        const lockerGeo = new THREE.BoxGeometry(0.8, 2.2, 0.8);
        const lockerMat = new THREE.MeshStandardMaterial({ color: '#5b6366', metalness: 0.6, roughness: 0.5 });
        
        for (let x = 1; x < MAP_SIZE - 1; x += 3) {
          for (let z = 1; z < MAP_SIZE - 1; z += 4) {
            if (grid[x][z] === 0 && grid[x + 1]?.[z] === 1) { // next to a wall
              const locker = new THREE.Mesh(lockerGeo, lockerMat);
              locker.position.set(x * CELL_SIZE + 1.6, 1.1, z * CELL_SIZE);
              scene.add(locker);
              breakablesRef.current.push({ mesh: locker, type: 'metal' });
            }
          }
        }
      }

      if (theme.props.includes('arcade')) {
        // Retro arcade machine models using primitives
        const cabGeo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
        const cabMat = new THREE.MeshStandardMaterial({ color: '#111122' });
        const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const screenGeo = new THREE.PlaneGeometry(0.6, 0.4);

        for (let x = 1; x < MAP_SIZE - 1; x += 4) {
          for (let z = 1; z < MAP_SIZE - 1; z += 5) {
            if (grid[x][z] === 0 && grid[x]?.[z + 1] === 1) {
              const group = new THREE.Group();
              const cab = new THREE.Mesh(cabGeo, cabMat);
              cab.position.y = 0.9;
              group.add(cab);

              const scr = new THREE.Mesh(screenGeo, screenMat);
              scr.position.set(0, 1.2, -0.41);
              scr.rotation.y = Math.PI;
              group.add(scr);

              // Cyber point light on the arcade screen
              const scrL = new THREE.PointLight(0x00ffcc, 1.0, 3);
              scrL.position.set(0, 1.2, -0.6);
              group.add(scrL);

              group.position.set(x * CELL_SIZE, 0, z * CELL_SIZE + 1.6);
              scene.add(group);
              breakablesRef.current.push({ mesh: group, type: 'metal' });
            }
          }
        }
      }

      // Spatial Clipping Anomalies (Chairs/tables/shoes/balls/signs/TVs embedded in walls/floors)
      const chairWoodMat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 });
      const chairSeatGeo = new THREE.BoxGeometry(0.6, 0.05, 0.6);
      const chairLegGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
      const chairBackGeo = new THREE.BoxGeometry(0.6, 0.6, 0.05);

      const createChairMesh = () => {
        const group = new THREE.Group();
        const seat = new THREE.Mesh(chairSeatGeo, chairWoodMat);
        seat.position.y = 0.5;
        seat.castShadow = true;
        group.add(seat);

        for (let dx of [-0.25, 0.25]) {
          for (let dz of [-0.25, 0.25]) {
            const leg = new THREE.Mesh(chairLegGeo, chairWoodMat);
            leg.position.set(dx, 0.25, dz);
            leg.castShadow = true;
            group.add(leg);
          }
        }

        const back = new THREE.Mesh(chairBackGeo, chairWoodMat);
        back.position.set(0, 0.8, -0.275);
        back.castShadow = true;
        group.add(back);
        return group;
      };

      const createTableMesh = () => {
        const group = new THREE.Group();
        const tableMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.8 });
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.8), tableMat);
        top.position.y = 0.7;
        top.castShadow = true;
        group.add(top);

        const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);
        for (let dx of [-0.5, 0.5]) {
          for (let dz of [-0.3, 0.3]) {
            const leg = new THREE.Mesh(legGeo, tableMat);
            leg.position.set(dx, 0.35, dz);
            leg.castShadow = true;
            group.add(leg);
          }
        }
        return group;
      };

      const createShoeMesh = () => {
        const group = new THREE.Group();
        const soleMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.6 });
        const shoeMat = new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.8 });
        
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.38), soleMat);
        sole.position.y = 0.02;
        group.add(sole);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.26), shoeMat);
        body.position.set(0, 0.08, -0.04);
        group.add(body);

        const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8), soleMat);
        toe.rotation.x = Math.PI / 2;
        toe.position.set(0, 0.06, 0.1);
        group.add(toe);
        return group;
      };

      const createBallMesh = () => {
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.3, metalness: 0.1 });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), ballMat);
        ball.castShadow = true;
        return ball;
      };

      const createRoadSignMesh = () => {
        const group = new THREE.Group();
        const postMat = new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.8, roughness: 0.2 });
        const signMat = new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.7 });
        const faceMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), postMat);
        post.position.y = 0.9;
        post.castShadow = true;
        group.add(post);

        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.02), signMat);
        plate.position.set(0, 1.6, 0);
        plate.rotation.z = Math.PI / 4;
        plate.castShadow = true;
        group.add(plate);

        const textDecal = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.03), faceMat);
        textDecal.position.set(0, 1.6, 0.01);
        group.add(textDecal);
        return group;
      };

      const createTvMesh = () => {
        const group = new THREE.Group();
        const tvMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 });
        const screenGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), tvMat);
        body.position.y = 0.25;
        body.castShadow = true;
        group.add(body);

        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.02), screenGlowMat);
        screen.position.set(0, 0.25, 0.25);
        group.add(screen);

        const light = new THREE.PointLight(0x00ffcc, 0.8, 2);
        light.position.set(0, 0.25, 0.35);
        group.add(light);
        return group;
      };

      const createProceduralShirt = (color: THREE.ColorRepresentation) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });
        
        // Torso body
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.38), mat);
        torso.castShadow = true;
        torso.receiveShadow = true;
        group.add(torso);
        
        // Left Sleeve (angled slightly outward)
        const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.16), mat);
        leftSleeve.position.set(-0.20, 0, 0.06);
        leftSleeve.rotation.y = Math.PI / 6;
        leftSleeve.castShadow = true;
        leftSleeve.receiveShadow = true;
        group.add(leftSleeve);
        
        // Right Sleeve (angled slightly outward)
        const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.16), mat);
        rightSleeve.position.set(0.20, 0, 0.06);
        rightSleeve.rotation.y = -Math.PI / 6;
        rightSleeve.castShadow = true;
        rightSleeve.receiveShadow = true;
        group.add(rightSleeve);
        
        // Darker inner neck trim/collar opening
        const collarMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.99 });
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.042, 0.06), collarMat);
        collar.position.set(0, 0, 0.17);
        group.add(collar);
        
        return group;
      };

      const createProceduralPants = (color: THREE.ColorRepresentation) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });
        
        // Waistband section
        const waist = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.14), mat);
        waist.castShadow = true;
        waist.receiveShadow = true;
        group.add(waist);
        
        // Left Leg (folded slightly outward)
        const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.038, 0.42), mat);
        leftLeg.position.set(-0.07, 0, -0.22);
        leftLeg.rotation.y = 0.08;
        leftLeg.castShadow = true;
        leftLeg.receiveShadow = true;
        group.add(leftLeg);
        
        // Right Leg (crossed slightly over)
        const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.038, 0.42), mat);
        rightLeg.position.set(0.07, 0, -0.22);
        rightLeg.rotation.y = -0.15;
        rightLeg.castShadow = true;
        rightLeg.receiveShadow = true;
        group.add(rightLeg);
        
        return group;
      };

      const createLaundryPileMesh = () => {
        const group = new THREE.Group();
        const colors = [0xd2b48c, 0xf5f5dc, 0x708090, 0x4682b4, 0x8b0000, 0xeeeeee];
        const numItems = 4 + Math.floor(Math.random() * 3); // 4 to 6 garments
        
        for (let i = 0; i < numItems; i++) {
          const color = colors[Math.floor(Math.random() * colors.length)];
          const garment = i % 2 === 0 ? createProceduralShirt(color) : createProceduralPants(color);
          
          const offsetX = (Math.random() - 0.5) * 0.3;
          const offsetZ = (Math.random() - 0.5) * 0.3;
          const offsetY = 0.02 + i * 0.045; // layer them up
          
          garment.position.set(offsetX, offsetY, offsetZ);
          garment.rotation.set(
            (Math.random() - 0.5) * 0.3,
            Math.random() * Math.PI,
            (Math.random() - 0.5) * 0.3
          );
          
          const scale = 0.85 + Math.random() * 0.3;
          garment.scale.set(scale, scale, scale);
          
          group.add(garment);
        }
        return group;
      };

      const createMannequinMesh = (color: THREE.ColorRepresentation, hasLegs: boolean) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.15, // glossy mannequin plastic
          metalness: 0.1
        });
        
        // Base plate stand
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), mat);
        base.position.y = 0.01;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        
        // Torso/Hip Stand pole
        const standMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.1 });
        const poleHeight = hasLegs ? 0.8 : 1.1; // longer pole if no legs
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, poleHeight, 8), standMat);
        pole.position.set(0, poleHeight / 2, 0);
        group.add(pole);

        let leftLeg = null;
        let rightLeg = null;

        if (hasLegs) {
          // Legs
          leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 8), mat);
          leftLeg.position.set(-0.07, 0.35, 0);
          leftLeg.castShadow = true;
          group.add(leftLeg);
          
          rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 8), mat);
          rightLeg.position.set(0.07, 0.35, 0);
          rightLeg.castShadow = true;
          group.add(rightLeg);
        }
        
        // Hips / Torso body
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.6, 12), mat);
        torso.position.set(0, 1.0, 0);
        torso.scale.set(1.2, 1.0, 0.75); // flatten chest Z-wise
        torso.castShadow = true;
        group.add(torso);
        
        // Arms
        const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 8), mat);
        leftArm.position.set(-0.16, 0.95, 0);
        leftArm.rotation.z = 0.08;
        leftArm.rotation.x = 0.1;
        leftArm.castShadow = true;
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 8), mat);
        rightArm.position.set(0.16, 0.95, 0);
        rightArm.rotation.z = -0.08;
        rightArm.rotation.x = -0.15;
        rightArm.castShadow = true;
        group.add(rightArm);
        
        // Neck
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), mat);
        neck.position.set(0, 1.34, 0);
        neck.castShadow = true;
        group.add(neck);
        
        // Head (oval face sphere)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 16), mat);
        head.position.set(0, 1.45, 0);
        head.scale.set(1.0, 1.15, 1.0);
        head.castShadow = true;
        group.add(head);

        // Store pointers in userData for animation loops
        group.userData = {
          hasLegs,
          leftLeg,
          rightLeg,
          leftArm,
          rightArm,
          isRunner: false,
          isActive: false
        };
        
        return group;
      };

      const creators = [
        createChairMesh,
        createTableMesh,
        createShoeMesh,
        createBallMesh,
        createRoadSignMesh,
        createTvMesh
      ];

      // Spawn 8 random anomalous objects embedded in floors/walls
      for (let i = 0; i < 8; i++) {
        const objSeed = seedNum + i * 47.92;
        const creatorIndex = Math.floor(Math.abs(Math.sin(objSeed * 1.7) * 100)) % creators.length;
        const createMesh = creators[creatorIndex];

        const x = Math.floor(Math.abs(Math.sin(objSeed * 3.4) * 100)) % (MAP_SIZE - 2) + 1;
        const z = Math.floor(Math.abs(Math.sin(objSeed * 1.9) * 100)) % (MAP_SIZE - 2) + 1;

        const posX = x * CELL_SIZE;
        const posZ = z * CELL_SIZE;
        const objectMesh = createMesh();

        if (i % 2 === 0) {
          // Sunk/Embedded into the FLOOR!
          const floorOffset = creatorIndex === 2 ? -0.02 : creatorIndex === 3 ? -0.12 : -0.25;
          objectMesh.position.set(
            posX + (Math.sin(objSeed) * 0.8),
            floorOffset,
            posZ + (Math.cos(objSeed) * 0.8)
          );
          objectMesh.rotation.x = Math.PI / 5 * Math.sin(objSeed * 2);
          objectMesh.rotation.z = Math.PI / 6 * Math.cos(objSeed * 3);
          objectMesh.rotation.y = objSeed;
        } else {
          // Embedded/Clipped sideways inside a WALL column!
          const sideOffset = (Math.sin(objSeed) > 0) ? 1.85 : -1.85;
          objectMesh.position.set(
            posX + sideOffset,
            0.6 + Math.abs(Math.sin(objSeed * 1.2)) * 1.2,
            posZ + (Math.cos(objSeed * 2.3) * 0.8)
          );
          objectMesh.rotation.z = Math.PI / 2.2 * (Math.sin(objSeed) > 0 ? 1 : -1);
          objectMesh.rotation.x = Math.PI / 8 * Math.cos(objSeed);
          objectMesh.rotation.y = objSeed;
        }

        scene.add(objectMesh);
        const propType = (creatorIndex === 0 || creatorIndex === 1) ? 'wood' 
                       : (creatorIndex === 4 || creatorIndex === 5) ? 'metal' 
                       : creatorIndex === 3 ? 'plastic' : 'soft';
        breakablesRef.current.push({ mesh: objectMesh, type: propType });
      }

      // Wall-to-floor pipe systems
      const pipeMat = new THREE.MeshStandardMaterial({ color: '#777777', metalness: 0.8, roughness: 0.2 });
      for (let i = 0; i < 3; i++) {
        const pipeSeed = seedNum + i * 9.87;
        const x = Math.floor(Math.abs(Math.sin(pipeSeed * 3.3) * 100)) % (MAP_SIZE - 4) + 2;
        const z = Math.floor(Math.abs(Math.sin(pipeSeed * 1.2) * 100)) % (MAP_SIZE - 4) + 2;
        const posX = x * CELL_SIZE;
        const posZ = z * CELL_SIZE;

        const pipeGroup = new THREE.Group();
        pipeGroup.position.set(posX, 0, posZ);

        const horizGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8);
        const horizPipe = new THREE.Mesh(horizGeo, pipeMat);
        horizPipe.rotation.z = Math.PI / 2;
        horizPipe.position.set(-0.9, 1.4, 0);
        pipeGroup.add(horizPipe);

        const elbowGeo = new THREE.SphereGeometry(0.14, 8, 8);
        const elbow = new THREE.Mesh(elbowGeo, pipeMat);
        elbow.position.set(0, 1.4, 0);
        pipeGroup.add(elbow);

        const vertGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8);
        const vertPipe = new THREE.Mesh(vertGeo, pipeMat);
        vertPipe.position.set(0, 0.7, 0);
        pipeGroup.add(vertPipe);

        scene.add(pipeGroup);
      }

      // Wall-embedded fuse boxes with indicator lights
      const boxGeo = new THREE.BoxGeometry(0.2, 0.8, 0.6);
      const boxMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', metalness: 0.9, roughness: 0.3 });
      const indicatorMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

      for (let i = 0; i < 3; i++) {
        const boxSeed = seedNum + i * 31.4;
        const x = Math.floor(Math.abs(Math.sin(boxSeed * 2.1) * 100)) % (MAP_SIZE - 2) + 1;
        const z = Math.floor(Math.abs(Math.sin(boxSeed * 0.9) * 100)) % (MAP_SIZE - 2) + 1;

        if (grid[x]?.[z] === 1 || grid[x]?.[z] === 2) {
          const posX = x * CELL_SIZE;
          const posZ = z * CELL_SIZE;

          const fuseBoxGroup = new THREE.Group();
          fuseBoxGroup.position.set(posX - 1.9, 1.6, posZ);

          const box = new THREE.Mesh(boxGeo, boxMat);
          fuseBoxGroup.add(box);

          const ledGeo = new THREE.SphereGeometry(0.02, 6, 6);
          const led = new THREE.Mesh(ledGeo, indicatorMat);
          led.position.set(0.1, 0.2, 0.1);
          fuseBoxGroup.add(led);

          const ledLight = new THREE.PointLight(0x00ff00, 0.5, 1.5);
          ledLight.position.set(0.15, 0.2, 0.1);
          fuseBoxGroup.add(ledLight);

          scene.add(fuseBoxGroup);
          breakablesRef.current.push({ mesh: fuseBoxGroup, type: 'metal' });
        }
      }

      // Spawn random piles of laundry in corners of corridors/rooms
      for (let x = 1; x < MAP_SIZE - 1; x++) {
        for (let z = 1; z < MAP_SIZE - 1; z++) {
          if (grid[x][z] === 0) {
            const hasNorth = grid[x][z - 1] === 1;
            const hasSouth = grid[x][z + 1] === 1;
            const hasWest = grid[x - 1][z] === 1;
            const hasEast = grid[x + 1][z] === 1;
            
            const corners: { dx: number; dz: number }[] = [];
            if (hasNorth && hasWest) corners.push({ dx: -CELL_SIZE / 2 + 0.6, dz: -CELL_SIZE / 2 + 0.6 });
            if (hasNorth && hasEast) corners.push({ dx: CELL_SIZE / 2 - 0.6, dz: -CELL_SIZE / 2 + 0.6 });
            if (hasSouth && hasWest) corners.push({ dx: -CELL_SIZE / 2 + 0.6, dz: CELL_SIZE / 2 - 0.6 });
            if (hasSouth && hasEast) corners.push({ dx: CELL_SIZE / 2 - 0.6, dz: CELL_SIZE / 2 - 0.6 });
            
            if (corners.length > 0) {
              const seedVal = seedNum + x * 12.3 + z * 45.7;
              const randVal = Math.abs(Math.sin(seedVal)) % 1;
              // 50% chance to spawn a laundry pile in a corner of this cell
              if (randVal < 0.50) {
                const cornerIndex = Math.floor(randVal * 100) % corners.length;
                const corner = corners[cornerIndex];
                const pile = createLaundryPileMesh();
                pile.position.set(x * CELL_SIZE + corner.dx, 0, z * CELL_SIZE + corner.dz);
                scene.add(pile);
                breakablesRef.current.push({ mesh: pile, type: 'soft' });
              }
            }
          }
        }
      }

      // Spawn random standing mannequins on all levels (scattered in random corridors)
      const levelSeed = seedNum;
      const hasMannequins = true;
      if (hasMannequins) {
        const mannequinCount = 3 + Math.floor((Math.abs(Math.sin(levelSeed * 3.25)) % 1) * 3); // 3 to 5 mannequins
        let spawned = 0;
        
        for (let attempt = 0; attempt < 40 && spawned < mannequinCount; attempt++) {
          const attemptSeed = levelSeed + attempt * 71.3;
          const x = Math.floor((Math.abs(Math.sin(attemptSeed * 1.8)) % 1) * (MAP_SIZE - 2)) + 1;
          const z = Math.floor((Math.abs(Math.sin(attemptSeed * 4.9)) % 1) * (MAP_SIZE - 2)) + 1;
          
          // Must be walkable, away from spawn, and not stairs/door
          if (grid[x]?.[z] === 0 && (x > 2 || z > 2)) {
            const colorSeed = Math.abs(Math.sin(attemptSeed * 9.2)) % 1;
            const color = colorSeed < 0.7 ? 0xece6dc : colorSeed < 0.9 ? 0x1c1c1c : 0x8b5a2b;
            
            const hasLegs = Math.abs(Math.sin(attemptSeed * 13.3)) % 1 < 0.6;
            const isRunner = hasLegs; // Every mannequin with legs will run after you!
            
            const mannequin = createMannequinMesh(color, hasLegs);
            mannequin.userData.isRunner = isRunner;
            
            // Random offset within the cell boundaries to prevent wall clipping
            const offX = (Math.abs(Math.sin(attemptSeed * 11.3)) % 1 - 0.5) * 1.2;
            const offZ = (Math.abs(Math.sin(attemptSeed * 17.7)) % 1 - 0.5) * 1.2;
            mannequin.position.set(x * CELL_SIZE + offX, 0, z * CELL_SIZE + offZ);
            
            // Random standing spin rotation
            mannequin.rotation.y = (Math.abs(Math.sin(attemptSeed * 25.1)) % 1) * Math.PI * 2;
            
            scene.add(mannequin);
            breakablesRef.current.push({ mesh: mannequin, type: 'plastic' });
            spawned++;
          }
        }
      }

      // Helper to construct a detailed yellow rubber duck
      const createDuckMesh = () => {
        const duckGroup = new THREE.Group();
        const yellowMat = new THREE.MeshStandardMaterial({ color: '#ffea00', roughness: 0.18 });
        const orangeMat = new THREE.MeshStandardMaterial({ color: '#ff6d00', roughness: 0.2 });
        const blackMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.5 });
        
        // Body
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), yellowMat);
        body.scale.set(1.2, 1, 1.4);
        duckGroup.add(body);
        
        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), yellowMat);
        head.position.set(0, 0.12, 0.08);
        duckGroup.add(head);
        
        // Beak
        const beak = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.065), orangeMat);
        beak.position.set(0, 0.11, 0.16);
        duckGroup.add(beak);
        
        // Eyes
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), blackMat);
        eyeL.position.set(-0.05, 0.14, 0.13);
        const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), blackMat);
        eyeR.position.set(0.05, 0.14, 0.13);
        duckGroup.add(eyeL, eyeR);
        
        return duckGroup;
      };

      // Helper to construct a white plastic lounge chair
      const createLoungeChairMesh = () => {
        const chairGroup = new THREE.Group();
        const whiteMat = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 });
        
        // Seat base
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.8), whiteMat);
        seat.position.set(0, 0.24, 0.1);
        seat.rotation.x = 0.05;
        chairGroup.add(seat);
        
        // Backrest
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.68), whiteMat);
        back.position.set(0, 0.46, -0.26);
        back.rotation.x = -0.65;
        chairGroup.add(back);
        
        // Front legs
        const legF1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4), whiteMat);
        legF1.position.set(-0.21, 0.12, 0.4);
        const legF2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4), whiteMat);
        legF2.position.set(0.21, 0.12, 0.4);
        chairGroup.add(legF1, legF2);
        
        // Back legs
        const legB1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4), whiteMat);
        legB1.position.set(-0.21, 0.12, -0.2);
        const legB2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4), whiteMat);
        legB2.position.set(0.21, 0.12, -0.2);
        chairGroup.add(legB1, legB2);
        
        return chairGroup;
      };

      // Spawn Water Fountains
      if (theme.props.includes('fountain')) {
        fountainsRef.current = [];
        const basinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.35, 12);
        const basinWaterGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.02, 12);
        const basinMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8 });
        const basinWaterMat = new THREE.MeshBasicMaterial({ color: '#5dade2', transparent: true, opacity: 0.7 });
        const pedestalGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6);
        const pedestalMat = new THREE.MeshStandardMaterial({ color: '#bbbbbb', roughness: 0.8 });
        
        // Static clean water column spout
        const spoutGeo = new THREE.CylinderGeometry(0.04, 0.22, 0.65, 8);
        const spoutMat = new THREE.MeshPhysicalMaterial({ 
          color: '#85d2ff', 
          transparent: true, 
          opacity: 0.65,
          roughness: 0.02,
          transmission: 0.85,
          ior: 1.333
        });

        for (let x = 1; x < MAP_SIZE - 1; x++) {
          for (let z = 1; z < MAP_SIZE - 1; z++) {
            if (x % 4 === 0 && z % 4 === 2 && grid[x][z] === 0 && !waterCellsRef.current.has(`${x},${z}`)) {
              const posX = x * CELL_SIZE;
              const posZ = z * CELL_SIZE;
              
              const fountainGroup = new THREE.Group();
              
              const basin = new THREE.Mesh(basinGeo, basinMat);
              basin.position.y = 0.175;
              basin.receiveShadow = true;
              fountainGroup.add(basin);
              
              const bWater = new THREE.Mesh(basinWaterGeo, basinWaterMat);
              bWater.position.y = 0.32;
              fountainGroup.add(bWater);
              
              const ped = new THREE.Mesh(pedestalGeo, pedestalMat);
              ped.position.y = 0.45;
              fountainGroup.add(ped);

              const spout = new THREE.Mesh(spoutGeo, spoutMat);
              spout.position.set(0, 0.775, 0);
              fountainGroup.add(spout);
              
              fountainGroup.position.set(posX, 0, posZ);
              scene.add(fountainGroup);
              
              breakablesRef.current.push({ mesh: fountainGroup, type: 'metal' });
            }
          }
        }
      }

      // Spawning floaties, ducks, and pool lounge chairs
      if (theme.props.includes('duck') || theme.props.includes('floatie') || theme.props.includes('pool-chair')) {
        const floatieTexture = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 16;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 64, 16);
          ctx.fillStyle = '#ff3b30';
          for (let i = 0; i < 64; i += 16) {
            ctx.fillRect(i, 0, 8, 16);
          }
          const texture = new THREE.CanvasTexture(canvas);
          texture.wrapS = THREE.RepeatWrapping;
          texture.repeat.set(4, 1);
          return texture;
        };

        const floatieMat = new THREE.MeshStandardMaterial({ map: floatieTexture(), roughness: 0.25 });
        const floatieGeo = new THREE.TorusGeometry(0.32, 0.09, 8, 16);

        for (let x = 1; x < MAP_SIZE - 1; x++) {
          for (let z = 1; z < MAP_SIZE - 1; z++) {
            if (grid[x][z] !== 0) continue;
            
            const posX = x * CELL_SIZE;
            const posZ = z * CELL_SIZE;
            const isWater = waterCellsRef.current.has(`${x},${z}`);

            if (isWater) {
              const seed = Math.abs(Math.sin(x * 37.19 + z * 83.279));
              
              if (seed < 0.13 && theme.props.includes('duck')) {
                const duck = createDuckMesh();
                duck.position.set(posX + (Math.random() - 0.5) * 1.5, -0.08, posZ + (Math.random() - 0.5) * 1.5);
                duck.rotation.y = Math.random() * Math.PI * 2;
                scene.add(duck);
                breakablesRef.current.push({ mesh: duck, type: 'plastic' });
              } else if (seed > 0.87 && theme.props.includes('floatie')) {
                const floatie = new THREE.Mesh(floatieGeo, floatieMat);
                floatie.rotation.x = Math.PI / 2;
                floatie.position.set(posX + (Math.random() - 0.5) * 1.5, -0.08, posZ + (Math.random() - 0.5) * 1.5);
                scene.add(floatie);
                breakablesRef.current.push({ mesh: floatie, type: 'plastic' });
              }
            } else {
              // Dry walkways - place white plastic lounge chairs
              if (theme.props.includes('pool-chair')) {
                const seed = Math.abs(Math.sin(x * 53.11 + z * 97.43));
                if (seed < 0.16) {
                  // Check if next to a water cell
                  const hasAdjacentWater = [
                    { dx: -1, dz: 0, rotY: -Math.PI / 2 },
                    { dx: 1, dz: 0, rotY: Math.PI / 2 },
                    { dx: 0, dz: -1, rotY: Math.PI },
                    { dx: 0, dz: 1, rotY: 0 }
                  ].find(d => waterCellsRef.current.has(`${x + d.dx},${z + d.dz}`));
                  
                  if (hasAdjacentWater) {
                    const chair = createLoungeChairMesh();
                    chair.position.set(posX + hasAdjacentWater.dx * 0.9, 0, posZ + hasAdjacentWater.dz * 0.9);
                    chair.rotation.y = hasAdjacentWater.rotY;
                    scene.add(chair);
                    breakablesRef.current.push({ mesh: chair, type: 'plastic' });
                  }
                }
              }
            }
          }
        }
      }
    };

    spawnProps();

    // 8. Spawn Interactive Items
    const itemsGroup = new THREE.Group();
    scene.add(itemsGroup);

    items.forEach(item => {
      if (item.found) return; // skip rendering if user already collected it

      const group = new THREE.Group();
      group.position.set(item.position[0], item.position[1], item.position[2]);

      let itemMesh: THREE.Mesh;

      if (item.type === 'file') {
        // Glowing folder: two thin flat planes
        const folderMat = new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide });
        const folderGeo = new THREE.BoxGeometry(0.4, 0.05, 0.3);
        itemMesh = new THREE.Mesh(folderGeo, folderMat);
      } else if (item.type === 'item') {
        // Water bottle: blue cylinder
        const bottleMat = new THREE.MeshStandardMaterial({ color: 0x3399ff, transparent: true, opacity: 0.8 });
        const bottleGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
        itemMesh = new THREE.Mesh(bottleGeo, bottleMat);
      } else {
        // VHS tape: flat black block
        const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const tapeGeo = new THREE.BoxGeometry(0.4, 0.08, 0.22);
        itemMesh = new THREE.Mesh(tapeGeo, tapeMat);
      }

      itemMesh.castShadow = true;
      group.add(itemMesh);

      // Subtle localized glow light above items
      const glow = new THREE.PointLight(
        item.type === 'file' ? 0xffd700 : item.type === 'item' ? 0x3399ff : 0xaaaaaa,
        1.5,
        2.5
      );
      glow.position.y = 0.3;
      group.add(glow);

      itemsGroup.add(group);
      itemsMeshesRef.current[item.id] = group;
    });

    // 9. Spawn Entity mesh
    // Twisted black wire stick figure monster (matching the reference image)
    const createEntity = () => {
      const entityGroup = new THREE.Group();
      
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

      // Torso - built as a bundle of twisted wire/branch strands
      const torsoGroup = new THREE.Group();
      entityGroup.add(torsoGroup);

      const createWireSegment = (parent: THREE.Group, radius: number, length: number, pos: THREE.Vector3, rot: THREE.Euler) => {
        const geo = new THREE.CylinderGeometry(radius, radius, length, 6);
        const mesh = new THREE.Mesh(geo, wireMat);
        mesh.position.copy(pos);
        mesh.rotation.copy(rot);
        parent.add(mesh);
      };

      // Torso strand 1 (crooked spine segment)
      createWireSegment(torsoGroup, 0.02, 0.8, new THREE.Vector3(-0.03, 1.1, 0.02), new THREE.Euler(0.1, 0, 0.15));
      createWireSegment(torsoGroup, 0.02, 0.8, new THREE.Vector3(0.02, 1.7, -0.01), new THREE.Euler(-0.15, 0, -0.1));
      
      // Torso strand 2 (wrap-around wire)
      createWireSegment(torsoGroup, 0.015, 0.7, new THREE.Vector3(0.04, 1.0, -0.03), new THREE.Euler(-0.2, 0.1, -0.1));
      createWireSegment(torsoGroup, 0.015, 0.7, new THREE.Vector3(-0.02, 1.6, 0.03), new THREE.Euler(0.15, -0.2, 0.2));

      // Torso strand 3 (straight-ish core wire)
      createWireSegment(torsoGroup, 0.025, 1.3, new THREE.Vector3(0, 1.35, 0), new THREE.Euler(0, 0, -0.05));

      // Head - horizontal loop/crown of wire (matching the loop head in the picture)
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 2.05, 0);
      
      // Horizontal loop ring
      const torusGeo = new THREE.TorusGeometry(0.18, 0.035, 6, 18);
      const torusMesh = new THREE.Mesh(torusGeo, wireMat);
      torusMesh.rotation.x = Math.PI / 2;
      headGroup.add(torusMesh);

      // A smaller loop nested inside at an angle for a more organic wire tangle
      const torusGeo2 = new THREE.TorusGeometry(0.12, 0.025, 6, 18);
      const torusMesh2 = new THREE.Mesh(torusGeo2, wireMat);
      torusMesh2.rotation.set(Math.PI / 4, Math.PI / 4, 0);
      headGroup.add(torusMesh2);
      
      entityGroup.add(headGroup);

      // Limbs - designed as crooked jointed legs/arms made of wire
      
      // Left Leg Group (pivot at hip)
      const leftLegGroup = new THREE.Group();
      leftLegGroup.position.set(-0.15, 0.7, 0);
      
      // Thigh (angled outwards)
      const leftThighGroup = new THREE.Group();
      createWireSegment(leftThighGroup, 0.02, 0.7, new THREE.Vector3(0, -0.3, 0), new THREE.Euler(0, 0, 0.25));
      leftLegGroup.add(leftThighGroup);
      
      // Calf (crooked, angled back in)
      const leftCalfGroup = new THREE.Group();
      leftCalfGroup.position.set(-0.06, -0.6, 0);
      createWireSegment(leftCalfGroup, 0.018, 0.7, new THREE.Vector3(0, -0.3, 0), new THREE.Euler(0.1, 0, -0.18));
      leftThighGroup.add(leftCalfGroup);
      entityGroup.add(leftLegGroup);

      // Right Leg Group (pivot at hip)
      const rightLegGroup = new THREE.Group();
      rightLegGroup.position.set(0.15, 0.7, 0);
      
      // Thigh (angled outwards)
      const rightThighGroup = new THREE.Group();
      createWireSegment(rightThighGroup, 0.02, 0.7, new THREE.Vector3(0, -0.3, 0), new THREE.Euler(0, 0, -0.25));
      rightLegGroup.add(rightThighGroup);
      
      // Calf (crooked, angled back in)
      const rightCalfGroup = new THREE.Group();
      rightCalfGroup.position.set(0.06, -0.6, 0);
      createWireSegment(rightCalfGroup, 0.018, 0.7, new THREE.Vector3(0, -0.3, 0), new THREE.Euler(-0.1, 0, 0.18));
      rightThighGroup.add(rightCalfGroup);
      entityGroup.add(rightLegGroup);

      // Left Arm Group (pivot at shoulder)
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(-0.18, 1.8, 0);
      
      // Upper arm
      const leftUpperArmGroup = new THREE.Group();
      createWireSegment(leftUpperArmGroup, 0.016, 0.65, new THREE.Vector3(0, -0.28, 0), new THREE.Euler(0.1, 0, -0.2));
      leftArmGroup.add(leftUpperArmGroup);
      
      // Lower arm (long creepy wire hanging down)
      const leftForearmGroup = new THREE.Group();
      leftForearmGroup.position.set(0.05, -0.55, 0);
      createWireSegment(leftForearmGroup, 0.014, 0.75, new THREE.Vector3(0, -0.32, 0), new THREE.Euler(0.2, 0, -0.05));
      leftUpperArmGroup.add(leftForearmGroup);
      entityGroup.add(leftArmGroup);

      // Right Arm Group (pivot at shoulder)
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(0.18, 1.8, 0);
      
      // Upper arm
      const rightUpperArmGroup = new THREE.Group();
      createWireSegment(rightUpperArmGroup, 0.016, 0.65, new THREE.Vector3(0, -0.28, 0), new THREE.Euler(-0.1, 0, 0.2));
      rightArmGroup.add(rightUpperArmGroup);
      
      // Lower arm (long creepy wire hanging down)
      const rightForearmGroup = new THREE.Group();
      rightForearmGroup.position.set(-0.05, -0.55, 0);
      createWireSegment(rightForearmGroup, 0.014, 0.75, new THREE.Vector3(0, -0.32, 0), new THREE.Euler(-0.2, 0, 0.05));
      rightUpperArmGroup.add(rightForearmGroup);
      entityGroup.add(rightArmGroup);

      // Store references in userData
      entityGroup.userData = {
        leftLeg: leftLegGroup,
        rightLeg: rightLegGroup,
        leftArm: leftArmGroup,
        rightArm: rightArmGroup,
        isChasing: false,
        chaseTimer: 0,
        appearCooldown: 2.0 + Math.random() * 4.0, // starts with a short initial delay so the player sees it early
      };

      // Set initial position
      entityGroup.position.set((MAP_SIZE - 2) * CELL_SIZE, 0, (MAP_SIZE - 2) * CELL_SIZE);
      entityGroup.visible = false; // Start hidden

      scene.add(entityGroup);
      entityMeshRef.current = entityGroup;
    };

    // Always create the entity structure in each level
    createEntity();

    // 10. Frame Loop & Player Physics/Update
    let animationFrameId: number;
    let lastTime = performance.now();
    let clockStart = performance.now();
    let stepTimer = 0;
    let lastSplashTime = 0;

    const loop = () => {
      const currentTime = performance.now();
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1); // cap delta lag
      lastTime = currentTime;
      const elapsedTime = (currentTime - clockStart) / 1000;

      // Apply Right analog look stick rotation
      if (joyRightTouch.current.active) {
        const lookSpeed = 1.2; // rad/sec
        mouseRef.current.yaw -= (joyRightOffset.current.x / 30) * lookSpeed * delta;
        mouseRef.current.pitch -= (joyRightOffset.current.y / 30) * lookSpeed * delta;
      }

      // Apply discrete Look Button rotation
      const buttonLookSpeed = 1.5; // rad/sec
      if (lookKeysRef.current.left) mouseRef.current.yaw += buttonLookSpeed * delta;
      if (lookKeysRef.current.right) mouseRef.current.yaw -= buttonLookSpeed * delta;
      if (lookKeysRef.current.up) mouseRef.current.pitch += buttonLookSpeed * 0.7 * delta;
      if (lookKeysRef.current.down) mouseRef.current.pitch -= buttonLookSpeed * 0.7 * delta;
      
      const limit = Math.PI / 2.2;
      mouseRef.current.pitch = Math.max(-limit, Math.min(limit, mouseRef.current.pitch));

      // Player rotation based on mouse orientation variables
      camera.rotation.order = 'YXZ';
      camera.rotation.y = mouseRef.current.yaw;
      camera.rotation.x = mouseRef.current.pitch;

      // Handle keyboard walking (pitch-independent horizontal walking using camera yaw)
      const speed = 3.5;
      const moveVector = new THREE.Vector3(0, 0, 0);

      if (noclipRef.current) {
        // In noclip, allow full 3D flight in the camera's gaze direction
        const verticalMove = new THREE.Vector3(0, 0, 0);
        if (keysRef.current['w'] || keysRef.current['arrowup']) verticalMove.z -= 1;
        if (keysRef.current['s'] || keysRef.current['arrowdown']) verticalMove.z += 1;
        if (keysRef.current['a'] || keysRef.current['arrowleft']) verticalMove.x -= 1;
        if (keysRef.current['d'] || keysRef.current['arrowright']) verticalMove.x += 1;
        verticalMove.normalize();
        verticalMove.applyQuaternion(camera.quaternion);
        moveVector.copy(verticalMove);
      } else {
        // Standard walk: project forward and right vectors onto the flat ground plane
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

        if (keysRef.current['w'] || keysRef.current['arrowup']) moveVector.add(forward);
        if (keysRef.current['s'] || keysRef.current['arrowdown']) moveVector.add(forward.clone().negate());
        if (keysRef.current['a'] || keysRef.current['arrowleft']) moveVector.add(right.clone().negate());
        if (keysRef.current['d'] || keysRef.current['arrowright']) moveVector.add(right);
        moveVector.normalize();
      }

      moveVector.multiplyScalar(speed * delta);

      // Basic collision checks (slide along walls)
      const nextPos = camera.position.clone().add(moveVector);
      
      if (noclipRef.current) {
        camera.position.copy(nextPos);
      } else {
        const buffer = 0.22;
        
        // 1. Check X axis collision
        const currentCx = Math.round(camera.position.x / CELL_SIZE);
        const currentCz = Math.round(camera.position.z / CELL_SIZE);
        const testX = camera.position.x + moveVector.x;
        let colX = false;
        
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cx = currentCx + dx;
            const cz = currentCz + dz;
            if (cx >= 0 && cx < MAP_SIZE && cz >= 0 && cz < MAP_SIZE) {
              const cellType = grid[cx][cz];
              let isSolid = false;
              if (cellType === 1 || cellType === 2) {
                isSolid = true;
              } else if (cellType === 3) {
                const door = doorsRef.current.find(d => d.x === cx && d.z === cz);
                if (door && !door.isOpen) {
                  isSolid = true;
                }
              }

              if (isSolid) {
                let sizeX = CELL_SIZE;
                let sizeZ = CELL_SIZE;

                if (cellType === 2) {
                  const isWideX = (cx + cz) % 2 === 0;
                  sizeX = isWideX ? 2.4 : 1.6;
                  sizeZ = isWideX ? 1.6 : 2.4;
                }

                const wallMinX = cx * CELL_SIZE - sizeX / 2 - buffer;
                const wallMaxX = cx * CELL_SIZE + sizeX / 2 + buffer;
                const wallMinZ = cz * CELL_SIZE - sizeZ / 2 - buffer;
                const wallMaxZ = cz * CELL_SIZE + sizeZ / 2 + buffer;

                if (
                  testX > wallMinX && testX < wallMaxX &&
                  camera.position.z > wallMinZ && camera.position.z < wallMaxZ
                ) {
                  colX = true;
                  break;
                }
              }
            }
          }
          if (colX) break;
        }

        if (!colX) {
          camera.position.x = testX;
        }

        // 2. Check Z axis collision
        const updatedCx = Math.round(camera.position.x / CELL_SIZE);
        const updatedCz = Math.round(camera.position.z / CELL_SIZE);
        const testZ = camera.position.z + moveVector.z;
        let colZ = false;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cx = updatedCx + dx;
            const cz = updatedCz + dz;
            if (cx >= 0 && cx < MAP_SIZE && cz >= 0 && cz < MAP_SIZE) {
              const cellType = grid[cx][cz];
              let isSolid = false;
              if (cellType === 1 || cellType === 2) {
                isSolid = true;
              } else if (cellType === 3) {
                const door = doorsRef.current.find(d => d.x === cx && d.z === cz);
                if (door && !door.isOpen) {
                  isSolid = true;
                }
              }

              if (isSolid) {
                let sizeX = CELL_SIZE;
                let sizeZ = CELL_SIZE;

                if (cellType === 2) {
                  const isWideX = (cx + cz) % 2 === 0;
                  sizeX = isWideX ? 2.4 : 1.6;
                  sizeZ = isWideX ? 1.6 : 2.4;
                }

                const wallMinX = cx * CELL_SIZE - sizeX / 2 - buffer;
                const wallMaxX = cx * CELL_SIZE + sizeX / 2 + buffer;
                const wallMinZ = cz * CELL_SIZE - sizeZ / 2 - buffer;
                const wallMaxZ = cz * CELL_SIZE + sizeZ / 2 + buffer;

                if (
                  camera.position.x > wallMinX && camera.position.x < wallMaxX &&
                  testZ > wallMinZ && testZ < wallMaxZ
                ) {
                  colZ = true;
                  break;
                }
              }
            }
          }
          if (colZ) break;
        }

        if (!colZ) {
          camera.position.z = testZ;
        }

        const px = Math.round(camera.position.x / CELL_SIZE);
        const pz = Math.round(camera.position.z / CELL_SIZE);
        let targetY = 1.6;
        if (px >= 0 && px < MAP_SIZE && pz >= 0 && pz < MAP_SIZE) {
          if (grid[px][pz] === 4) {
            const cellZ = pz * CELL_SIZE;
            const relZ = camera.position.z - cellZ;
            const t = (relZ + CELL_SIZE / 2) / CELL_SIZE;
            const stairClimb = Math.max(0, Math.min(1, t)) * 3.5;
            targetY = 1.6 + stairClimb;
          } else if (waterCellsRef.current.has(`${px},${pz}`)) {
            targetY = 1.2; // chest-deep water wading height!
          }
        }
        
        // Smoothly interpolate player camera height down/up
        camera.position.y += (targetY - camera.position.y) * 6.5 * delta;

        // Play wading footstep splashes if moving in water
        const isMoving = (keysRef.current['w'] || keysRef.current['s'] || keysRef.current['a'] || keysRef.current['d'] ||
                          keysRef.current['arrowup'] || keysRef.current['arrowdown'] || keysRef.current['arrowleft'] || keysRef.current['arrowright'] ||
                          (joyLeftTouch.current && joyLeftTouch.current.active));
        
        if (isMoving && waterCellsRef.current.has(`${px},${pz}`)) {
          stepTimer += delta;
          if (stepTimer >= 0.44) {
            stepTimer = 0;
            const timeNow = performance.now();
            if (timeNow - lastSplashTime > 150) {
              lastSplashTime = timeNow;
              Synthesizer.triggerWaterSplash(0.45);
            }
          }
        } else {
          stepTimer = 0;
        }
      }

      setPlayerPos({ x: camera.position.x, z: camera.position.z });

      // Check if player goes through an open door, stairs (near the top), or windows to generate a new level
      const px = Math.round(camera.position.x / CELL_SIZE);
      const pz = Math.round(camera.position.z / CELL_SIZE);
      if (px >= 0 && px < MAP_SIZE && pz >= 0 && pz < MAP_SIZE) {
        if (grid[px][pz] === 3) {
          const door = doorsRef.current.find(d => d.x === px && d.z === pz);
          if (door && door.isOpen) {
            onLevelTransition(Math.floor(Math.random() * 1000000));
          }
        } else if (grid[px][pz] === 4) {
          // Walk up stairs to near the top (t > 0.85) to transition
          const cellZ = pz * CELL_SIZE;
          const relZ = camera.position.z - cellZ;
          const t = (relZ + CELL_SIZE / 2) / CELL_SIZE;
          if (t > 0.85) {
            onLevelTransition(Math.floor(Math.random() * 1000000));
          }
        } else if (grid[px][pz] === 5) {
          // Wall Window: compute exact offset placement coordinates of the frame to check distance
          let offX = 0;
          let offZ = 0;
          if (px < MAP_SIZE - 1 && (grid[px+1][pz] === 0 || grid[px+1][pz] === 3 || grid[px+1][pz] === 4)) {
            offX = CELL_SIZE / 2 - 0.15;
          } else if (px > 0 && (grid[px-1][pz] === 0 || grid[px-1][pz] === 3 || grid[px-1][pz] === 4)) {
            offX = -CELL_SIZE / 2 + 0.15;
          } else if (pz < MAP_SIZE - 1 && (grid[px][pz+1] === 0 || grid[px][pz+1] === 3 || grid[px][pz+1] === 4)) {
            offZ = CELL_SIZE / 2 - 0.15;
          } else if (pz > 0 && (grid[px][pz-1] === 0 || grid[px][pz-1] === 3 || grid[px][pz-1] === 4)) {
            offZ = -CELL_SIZE / 2 + 0.15;
          }
          const winX = px * CELL_SIZE + offX;
          const winZ = pz * CELL_SIZE + offZ;
          const dist = Math.sqrt(Math.pow(camera.position.x - winX, 2) + Math.pow(camera.position.z - winZ, 2));
          if (dist < 0.8) {
            onLevelTransition(Math.floor(Math.random() * 1000000));
          }
        } else if (grid[px][pz] === 6) {
          // Floor Window: check distance to cell center
          const winX = px * CELL_SIZE;
          const winZ = pz * CELL_SIZE;
          const dist = Math.sqrt(Math.pow(camera.position.x - winX, 2) + Math.pow(camera.position.z - winZ, 2));
          if (dist < 0.8) {
            onLevelTransition(Math.floor(Math.random() * 1000000));
          }
        }
      }

      // Align Flashlight direction & position with camera
      if (flashlightRef.current) {
        flashlightRef.current.visible = flashlightOn;
        if (flashlightOn) {
          flashlightRef.current.position.copy(camera.position);
          
          // Flashlight points slightly forward from camera gaze
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          flashlightRef.current.target.position.copy(camera.position).add(dir);
          flashlightRef.current.target.updateMatrixWorld();
        }
      }

      // Fluorescent Flicker / strobe simulation
      if (ceilingLightsList.length > 0) {
        const glowColor = theme.lightingStyle === 'red-alarm' ? 0xff3333 : theme.lightingStyle === 'neon' ? 0x00f0ff : 0xffffe0;

        const time = elapsedTime;
        ceilingLightsList.forEach((state, index) => {
          // Decrement flicker ticks
          state.flickerTicks--;
          if (state.flickerTicks <= 0) {
            // Decide next state:
            // ~75% chance to enter/remain in a flickering state (state.flickerState = false)
            // ~25% chance to enter/remain in a stable state (state.flickerState = true)
            const nextIsStable = Math.random() < 0.25;
            state.flickerState = nextIsStable;
            if (nextIsStable) {
              // Stable period: 10 to 40 frames
              state.flickerTicks = Math.floor(Math.random() * 30) + 10;
            } else {
              // Flickering period: 60 to 180 frames
              state.flickerTicks = Math.floor(Math.random() * 120) + 60;
            }
          }

          const baseIntensity = state.originalIntensity * (0.85 + Math.sin(time * 50 + index * 3.1) * 0.06);

          if (theme.lightingStyle === 'strobe') {
            const isOff = Math.random() > 0.95;
            state.light.intensity = isOff ? 0.05 : state.originalIntensity;
            (state.panel.material as THREE.MeshBasicMaterial).color.setHex(isOff ? 0x222222 : glowColor);
          } else if (theme.lightingStyle === 'red-alarm') {
            const factor = 1.0 + Math.sin(time * 4) * 0.7;
            let currentIntensity = state.originalIntensity * factor;
            
            // Also add flickering to red-alarm if active
            if (!state.flickerState && Math.random() > 0.50) {
              const isOff = Math.random() > 0.5;
              currentIntensity = isOff ? 0.0 : currentIntensity * 0.15;
              (state.panel.material as THREE.MeshBasicMaterial).color.setHex(isOff ? 0x1a0000 : 0x440000);
            } else {
              (state.panel.material as THREE.MeshBasicMaterial).color.setHex(glowColor);
            }
            state.light.intensity = currentIntensity;
          } else {
            // Fluorescent, white-sterile, neon, misty, etc.
            if (!state.flickerState) {
              // Flickering: on each frame in this state, 70% chance of an actual flicker/dim/off event
              if (Math.random() > 0.30) {
                const rand = Math.random();
                if (rand < 0.40) {
                  // Turn off
                  state.light.intensity = 0.0;
                  (state.panel.material as THREE.MeshBasicMaterial).color.setHex(0x1a1a1a);
                } else if (rand < 0.85) {
                  // Dimmed
                  state.light.intensity = state.originalIntensity * 0.15;
                  const dimHex = theme.lightingStyle === 'neon' ? 0x003333 : 0x444433;
                  (state.panel.material as THREE.MeshBasicMaterial).color.setHex(dimHex);
                } else {
                  // Flicker surge
                  state.light.intensity = state.originalIntensity * 1.25;
                  (state.panel.material as THREE.MeshBasicMaterial).color.setHex(glowColor);
                }
              } else {
                // Otherwise normal brightness
                state.light.intensity = baseIntensity;
                (state.panel.material as THREE.MeshBasicMaterial).color.setHex(glowColor);
              }
            } else {
              // Stable
              state.light.intensity = baseIntensity;
              (state.panel.material as THREE.MeshBasicMaterial).color.setHex(glowColor);
            }
          }
        });
      }

      // Animate door swings open/close
      doorsRef.current.forEach(door => {
        const targetAngle = door.isOpen ? Math.PI / 1.8 : 0;
        door.angle += (targetAngle - door.angle) * 10 * delta; // lerp Y rotation
        door.group.rotation.y = door.angle;
      });

      // Rotate interactable item meshes
      const rotSpeed = 1.0 * delta;
      Object.keys(itemsMeshesRef.current).forEach(id => {
        const mesh = itemsMeshesRef.current[id];
        if (mesh) {
          mesh.rotation.y += rotSpeed;
          // Float up and down slightly
          mesh.position.y = 0.4 + Math.sin(elapsedTime * 2 + id.charCodeAt(0)) * 0.1;
        }
      });

      // Item proximity detection
      let nearestItem: SearchableItem | null = null;
      let minDistance = 2.0; // 2 meters to trigger search UI

      for (const item of items) {
        if (item.found) continue;
        const dist = camera.position.distanceTo(
          new THREE.Vector3(item.position[0], camera.position.y, item.position[2])
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestItem = item;
          onItemFound(item.id);
        }
      }

      // Door proximity detection
      let nearestDoor: any = null;
      let minDoorDist = 3.0; // 3.0 meters to trigger door interaction

      for (const door of doorsRef.current) {
        const doorPos = new THREE.Vector3(door.x * CELL_SIZE, camera.position.y, door.z * CELL_SIZE);
        const dist = camera.position.distanceTo(doorPos);
        if (dist < minDoorDist) {
          minDoorDist = dist;
          nearestDoor = door;
          if (dist < 2.8 && !door.isOpen) {
            door.isOpen = true;
            Synthesizer.triggerEntityGlitch();
          }
        }
      }

      // Stairs proximity detection
      let nearestStairs = false;
      for (let x = 0; x < MAP_SIZE; x++) {
        for (let z = 0; z < MAP_SIZE; z++) {
          if (grid[x][z] === 4) {
            const stairsPos = new THREE.Vector3(x * CELL_SIZE, camera.position.y, z * CELL_SIZE);
            const dist = camera.position.distanceTo(stairsPos);
            if (dist < 1.8) {
              nearestStairs = true;
            }
          }
        }
      }

      // Update item state
      if (nearestItem !== activeItemNear) {
        setActiveItemNear(nearestItem);
      }

      // Update door state
      if (nearestDoor !== activeDoorNear) {
        setActiveDoorNear(nearestDoor);
      }

      // Coordinate HUD Messages
      if (nearestItem) {
        setHudMessage(`PROXIMITY DETECTED: [${nearestItem.name.toUpperCase()}] - PRESS [E] OR CLICK TO SEARCH`);
      } else if (nearestDoor) {
        setHudMessage(`PROXIMITY DETECTED: [WOODEN DOOR] - PRESS [E] OR CLICK TO SWING ${nearestDoor.isOpen ? 'CLOSE' : 'OPEN'}`);
      } else if (nearestStairs) {
        setHudMessage('PROXIMITY DETECTED: [STAIRS] - WALK ONTO STAIRS TO ASCEND TO NEXT LEVEL');
      } else {
        setHudMessage('USE WASD / ARROWS TO MOVE. DRAG SCREEN TO LOOK.');
      }

      // Entity AI/Vibe
      if (entityMeshRef.current) {
        const ent = entityMeshRef.current;
        const uData = ent.userData;
        const entPos = ent.position;

        if (!uData.isChasing) {
          // Decrement cooldown
          uData.appearCooldown -= delta;
          setEntityDistance(999.0); // Reset warning overlay when hidden

          if (uData.appearCooldown <= 0) {
            // Find a walkable corridor cell with straight line of sight to spawn the monster
            const px = Math.round(camera.position.x / CELL_SIZE);
            const pz = Math.round(camera.position.z / CELL_SIZE);
            let candidates: { x: number; z: number }[] = [];

            // 1. Try to find a straight corridor with clear line of sight in 4 directions
            for (let d = 3; d <= 7; d++) {
              const directions = [
                { dx: 1, dz: 0 },
                { dx: -1, dz: 0 },
                { dx: 0, dz: 1 },
                { dx: 0, dz: -1 }
              ];
              for (const dir of directions) {
                const sx = px + dir.dx * d;
                const sz = pz + dir.dz * d;
                if (sx > 0 && sx < MAP_SIZE - 1 && sz > 0 && sz < MAP_SIZE - 1) {
                  let clearPath = true;
                  for (let i = 1; i <= d; i++) {
                    const tx = px + dir.dx * i;
                    const tz = pz + dir.dz * i;
                    if (grid[tx]?.[tz] !== 0 && grid[tx]?.[tz] !== 4) { // Open walkway or open stairs cell
                      clearPath = false;
                      break;
                    }
                  }
                  if (clearPath) {
                    candidates.push({ x: sx, z: sz });
                  }
                }
              }
            }

            // Fallback: search for any open cells 3 to 6 cells away if no straight corridors found
            if (candidates.length === 0) {
              for (let x = 1; x < MAP_SIZE - 1; x++) {
                for (let z = 1; z < MAP_SIZE - 1; z++) {
                  if (grid[x][z] === 0) {
                    const distCells = Math.abs(x - px) + Math.abs(z - pz);
                    if (distCells >= 3 && distCells <= 6) {
                      candidates.push({ x, z });
                    }
                  }
                }
              }
            }

            if (candidates.length > 0) {
              const spawn = candidates[Math.floor(Math.random() * candidates.length)];
              entPos.set(spawn.x * CELL_SIZE, 0, spawn.z * CELL_SIZE);
              ent.visible = true;
              uData.isChasing = true;
              uData.chaseTimer = 11.0 + Math.random() * 4.0; // chases for 11-15 seconds
              Synthesizer.triggerEntityScreech();
            } else {
              // Retry in a few seconds if no grid cell fits
              uData.appearCooldown = 3.0;
            }
          }
        } else {
          // Active Chase Mode!
          uData.chaseTimer -= delta;
          const distToPlayer = camera.position.distanceTo(entPos);
          setEntityDistance(distToPlayer);

          // Make the entity face the player (billboard orientation)
          ent.lookAt(camera.position.x, entPos.y, camera.position.z);

          // Move the entity towards the player at chase speed
          const dir = new THREE.Vector3().subVectors(camera.position, entPos);
          dir.y = 0;
          dir.normalize();
          entPos.add(dir.multiplyScalar(2.2 * delta));

          // Swing limbs creepily during the chase!
          const swingSpeed = 15;
          const swingAngle = 0.5;
          uData.leftLeg.rotation.x = Math.sin(elapsedTime * swingSpeed) * swingAngle;
          uData.rightLeg.rotation.x = -Math.sin(elapsedTime * swingSpeed) * swingAngle;
          
          uData.leftArm.rotation.x = Math.cos(elapsedTime * swingSpeed * 1.2) * swingAngle * 1.5;
          uData.rightArm.rotation.x = -Math.cos(elapsedTime * swingSpeed * 1.2) * swingAngle * 1.5;
          uData.leftArm.rotation.z = -0.35 + Math.sin(elapsedTime * 5) * 0.15;
          uData.rightArm.rotation.z = 0.35 - Math.sin(elapsedTime * 5) * 0.15;

          // Eerie glitch static sounds when nearby
          if (distToPlayer < 8.0) {
            if (Math.random() > 0.97 - (8.0 - distToPlayer) * 0.015) {
              Synthesizer.triggerEntityGlitch();
            }
          }

          // "chasing you, but not catching you":
          // Dissolve / vanish when it gets within 2.8 meters (close range visual contact)
          // or if the timer expires.
          if (distToPlayer < 2.8 || uData.chaseTimer <= 0) {
            Synthesizer.triggerEntityGlitch();
            
            // Creepy dissolve transition: set invisible, reset states
            ent.visible = false;
            uData.isChasing = false;
            
            // Reset limbs to neutral standing position
            uData.leftLeg.rotation.set(0, 0, 0);
            uData.rightLeg.rotation.set(0, 0, 0);
            uData.leftArm.rotation.set(0, 0, 0);
            uData.rightArm.rotation.set(0, 0, 0);

            // Set new cooldown before next appearance (20 to 45 seconds of suspense)
            uData.appearCooldown = 20.0 + Math.random() * 25.0;
            setEntityDistance(999.0);
          }
        }
      }

      // A. Update Hammer Swing Animation
      if (hammerRef.current) {
        const hammer = hammerRef.current;
        if (isSwingingRef.current) {
          const swingTime = currentTime - swingStartTimeRef.current;
          if (swingTime < 300) {
            const t = swingTime / 300;
            const angleScale = Math.sin(t * Math.PI); // Smooth curve peaking at t = 0.5 (150ms)
            
            // Swing forward thrust and tilt rotation
            hammer.rotation.x = -0.5 - angleScale * 1.5;
            hammer.rotation.y = -Math.PI / 3 + angleScale * 0.8;
            hammer.rotation.z = 0.2 - angleScale * 0.4;
            
            // Lunge forward slightly
            hammer.position.x = 0.18 - angleScale * 0.08;
            hammer.position.y = -0.18 - angleScale * 0.05;
            hammer.position.z = -0.35 - angleScale * 0.15;
            
            // Raycast hit detection at the peak stroke of the swing
            if (swingTime >= 135 && !hasHitThisSwingRef.current) {
              hasHitThisSwingRef.current = true;
              performHitDetection();
            }
          } else {
            isSwingingRef.current = false;
            hammer.visible = false;
            // Reset to rest position
            hammer.position.set(0.18, -0.18, -0.35);
            hammer.rotation.set(-0.5, -Math.PI / 3, 0.2);
          }
        } else {
          hammer.visible = false;
        }
      }

      // B. Update Runner Mannequins AI
      for (let b of breakablesRef.current) {
        if (b.mesh.userData && b.mesh.userData.isRunner) {
          const m = b.mesh;
          const uData = m.userData;
          const mPos = m.position;
          const dist = camera.position.distanceTo(mPos);

          if (!uData.isActive) {
            // Wake up when player gets within 6.5 meters
            if (dist < 6.5) {
              uData.isActive = true;
              Synthesizer.triggerEntityGlitch();
            }
          } else {
            // Move toward player
            const dir = new THREE.Vector3().copy(camera.position).sub(mPos);
            dir.y = 0;
            dir.normalize();

            mPos.add(dir.multiplyScalar(2.2 * delta));
            m.rotation.y = Math.atan2(dir.x, dir.z);

            // Limb running animation
            const runSpeed = 16;
            const runAngle = 0.6;
            if (uData.leftLeg && uData.rightLeg) {
              uData.leftLeg.rotation.x = Math.sin(elapsedTime * runSpeed) * runAngle;
              uData.rightLeg.rotation.x = -Math.sin(elapsedTime * runSpeed) * runAngle;
            }
            if (uData.leftArm && uData.rightArm) {
              uData.leftArm.rotation.x = Math.cos(elapsedTime * runSpeed) * runAngle * 1.2;
              uData.rightArm.rotation.x = -Math.cos(elapsedTime * runSpeed) * runAngle * 1.2;
            }

            // Touch player check: glitch jumpscare & auto-shatter
            if (dist < 0.95) {
              setEntityDistance(1.0);
              setTimeout(() => setEntityDistance(999.0), 800);
              smashObject(b);
              break; // exit early to prevent collection mutation errors
            }
          }
        }
      }

      // C. Update Debris Particles Physics
      const now = performance.now();
      const dt = Math.min(delta, 0.03); // clamp to prevent physics explosion
      const activeDebris = [];
      
      for (let d of debrisRef.current) {
        const age = now - d.spawnTime;
        if (age > 3000) {
          scene.remove(d.mesh);
          d.mesh.geometry.dispose();
          if (Array.isArray(d.mesh.material)) {
            d.mesh.material.forEach(m => m.dispose());
          } else {
            d.mesh.material.dispose();
          }
          continue;
        }
        
        // Apply gravity and velocity vector changes
        d.vy -= 9.8 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        
        // Floor collision bounce
        if (d.mesh.position.y < 0.05) {
          d.mesh.position.y = 0.05;
          d.vy = -d.vy * 0.35; // Bouncing dampening coefficient
          d.vx *= 0.7; // Floor sliding friction coefficient
          d.vz *= 0.7;
        }
        
        // Fade out materials gradually in the final second before deletion
        if (age > 2000) {
          const progress = (age - 2000) / 1000;
          d.mesh.traverse(child => {
            if ((child as any).material) {
              const mat = (child as any).material;
              mat.transparent = true;
              mat.opacity = 1.0 - progress;
            }
          });
        }
        
        activeDebris.push(d);
      }
      debrisRef.current = activeDebris;

      // Update Steam Particles Animation
      steamParticlesRef.current.forEach(p => {
        p.life += delta;
        
        // Drift and expand
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        
        // Slowly grow in size
        const scale = 1.0 + (p.life / p.maxLife) * 2.2;
        p.mesh.scale.set(scale, scale, scale);

        // Fade out
        const progress = p.life / p.maxLife;
        if (p.mesh.material) {
          (p.mesh.material as THREE.Material).opacity = 0.16 * (1.0 - progress);
        }

        // Reset particle if lifetime expired
        if (p.life >= p.maxLife) {
          p.life = 0;
          p.mesh.position.set(p.ox, p.oy, p.oz);
          p.mesh.scale.set(1, 1, 1);
          if (p.mesh.material) {
            (p.mesh.material as THREE.Material).opacity = 0.16;
          }
        }
      });

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    // 11. Handle Resizes
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      
      // Prevent recursive layout resize loops by checking if dimensions actually changed
      const currentSize = new THREE.Vector2();
      rendererRef.current.getSize(currentSize);
      if (Math.abs(currentSize.x - w) < 1 && Math.abs(currentSize.y - h) < 1) {
        return;
      }
      
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup logic
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      
      // Dispose steam particles
      steamParticlesRef.current.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach(m => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
      });

      // Dispose materials & geometries
      mazeGroup.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      scene.clear();
      renderer.dispose();
    };
  }, [theme]);

  // Remove found items from visual scene
  useEffect(() => {
    items.forEach(item => {
      if (item.found && itemsMeshesRef.current[item.id]) {
        const mesh = itemsMeshesRef.current[item.id];
        if (sceneRef.current && mesh) {
          sceneRef.current.remove(mesh);
          delete itemsMeshesRef.current[item.id];
        }
      }
    });
  }, [items]);

  // Synchronize flashlight visibility state dynamically without level rebuilds
  useEffect(() => {
    if (flashlightRef.current) {
      flashlightRef.current.visible = flashlightOn;
    }
  }, [flashlightOn]);

  // Translate units to coordinates for rendering maps
  const renderMiniMap = () => {
    return (
      <div className="absolute top-[68px] right-4 bg-black/85 border border-green-500/30 p-2 font-mono text-[9px] text-green-500 leading-none select-none rounded shadow-md hidden sm:block z-30">
        <div className="text-center font-bold border-b border-green-500/20 pb-1 mb-1 flex items-center gap-1 justify-center">
          <Compass className="w-3 h-3 animate-spin-slow" /> MAPPING RADAR
        </div>
        <div className="grid gap-[1px]">
          {mapGridRef.current.map((row, zIndex) => (
            <div key={zIndex} className="flex gap-[1px]">
              {row.map((cell, xIndex) => {
                const px = Math.round(playerPos.x / CELL_SIZE);
                const pz = Math.round(playerPos.z / CELL_SIZE);
                const isPlayer = px === xIndex && pz === zIndex;

                let char = '░';
                let color = 'text-green-500/20';

                if (cell === 1 || cell === 2) {
                  char = '█';
                  color = 'text-green-500/50';
                } else if (cell === 3) {
                  char = '⧉';
                  color = 'text-blue-400';
                } else if (cell === 4) {
                  char = '▤';
                  color = 'text-orange-400 font-bold';
                }
                if (isPlayer) {
                  char = '▲';
                  color = 'text-yellow-400 animate-pulse';
                }

                return (
                  <span key={xIndex} className={`${color} w-[8px] h-[8px] inline-block text-center`}>
                    {char}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="text-[7px] text-green-500/60 mt-1 text-center">
          X: {playerPos.x.toFixed(1)} | Z: {playerPos.z.toFixed(1)}
        </div>
      </div>
    );
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-[#050906] overflow-hidden"
    >
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block cursor-crosshair"
      />
      
      {/* Retro VHS overlay screen filter covering the full canvas */}
      <VHSOverlay entityDistance={entityDistance} />



      {/* Entity Glitch Warning Overlay */}
      {entityDistance < 8 && (
        <div 
          className="absolute inset-0 pointer-events-none bg-red-900/10 border border-red-500/30 animate-pulse flex items-center justify-center z-25"
          style={{
            opacity: Math.max(0.1, (8 - entityDistance) / 8),
          }}
        >
          <div className="font-mono text-red-500 text-[8px] tracking-widest bg-black/90 px-2.5 py-1 border border-red-500 rounded uppercase flex items-center gap-1.5">
            <EyeOff className="w-3.5 h-3.5 animate-bounce text-red-500" />
            <span>ALERT: DISTANCE {entityDistance.toFixed(1)}m</span>
          </div>
        </div>
      )}



      {/* Touch Screen Joystick (unconditionally rendered, hidden on desktop via CSS) */}
      <div 
        className="touch-joystick-base"
        onTouchStart={handleLeftTouchStart}
        onTouchMove={handleLeftTouchMove}
        onTouchEnd={handleLeftTouchEnd}
      >
        <div ref={leftKnobRef} className="touch-joystick-knob" />
      </div>

      {/* Swing Hammer Button (Mobile touch target, hidden on desktop via CSS) */}
      <button
        className="touch-hammer-btn"
        onClick={() => triggerHammerSwing()}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 12-8.373 8.373a1 1 0 1 1-1.414-1.414L13.586 10.586A2 2 0 0 1 15 12Z"/>
          <path d="m18 9 3-3-3-3-3 3 3 3Z"/>
          <path d="m14 5 5 5"/>
        </svg>
      </button>
    </div>
  );
};

export default ThreeCanvas;
