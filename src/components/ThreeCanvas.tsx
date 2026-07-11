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
  
  // Map dimensions
  const MAP_SIZE = 14;
  const CELL_SIZE = 4;
  const mapGridRef = useRef<number[][]>([]);

  // Procedural canvas textures
  const createProceduralTexture = (type: string, baseColor: string, isWall: boolean = false): THREE.Texture => {
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
        // Rainbow wallpaper
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['stripe', 'stripes', 'striped'].includes(w))) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < size; i += 32) {
          ctx.fillRect(i, 0, 16, size);
        }
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['grid', 'grids'].includes(w))) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(0,255,0,0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= size; i += 16) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['brick', 'bricks', 'brickwork'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['polka', 'dots', 'spotted', 'dot'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['glitch', 'static', 'matrix', 'noise', 'digital'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['star', 'stars', 'starry', 'space'].includes(w))) {
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffdf00';
        for (let i = 0; i < 25; i++) {
          const sx = Math.random() * size;
          const sy = Math.random() * size;
          ctx.fillRect(sx - 2, sy, 5, 1);
          ctx.fillRect(sx, sy - 2, 1, 5);
        }
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['flower', 'flowers', 'floral', 'garden'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['wood', 'planks', 'wooden'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['heart', 'hearts', 'love'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }

      if (words.some(w => ['checker', 'checkers', 'checkerboard'].includes(w))) {
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
        return new THREE.CanvasTexture(canvas);
      }
    }

    if (type === 'default') {
      // Level 0 Wallpaper: vertical stripes and subtle grid patterns
      ctx.fillStyle = '#b3a078';
      for (let i = 0; i < size; i += 16) {
        ctx.fillRect(i, 0, 2, size);
      }
      ctx.fillStyle = '#9e8c66';
      for (let i = 0; i < size; i += 32) {
        for (let j = 0; j < size; j += 32) {
          // Draw tiny diamond pattern
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
      // Rough concrete: speckles and cracks
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
      // Cracks
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
    } else if (type === 'tiles' || type === 'hospital') {
      // Classic wall tiles & ceiling tiles grid lines
      const isCeilingBeige = baseColor === '#ccbe9f' || baseColor === '#d6cbac';
      ctx.strokeStyle = isCeilingBeige 
        ? 'rgba(0,0,0,0.22)' 
        : type === 'hospital' 
          ? 'rgba(0,0,0,0.1)' 
          : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = isCeilingBeige ? 1 : 2;
      for (let i = 0; i <= size; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }
      if (!isCeilingBeige) {
        // Highlight/bevel effect
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let i = 0; i < size; i += 64) {
          ctx.fillRect(i + 2, 2, 60, 4);
          ctx.fillRect(2, i + 2, 4, 60);
        }
      }
    } else if (type === 'metal') {
      // Industrial riveted sheets
      ctx.strokeStyle = '#2b2623';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, size, size);
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
      
      // Rivets at intersections and corners
      ctx.fillStyle = '#1c1816';
      const rivets = [
        [15, 15], [size / 2 - 15, 15], [size / 2 + 15, 15], [size - 15, 15],
        [15, size / 2 - 15], [size - 15, size / 2 - 15],
        [15, size / 2 + 15], [size - 15, size / 2 + 15],
        [15, size - 15], [size / 2 - 15, size - 15], [size / 2 + 15, size - 15], [size - 15, size - 15]
      ];
      rivets.forEach(([rx, ry]) => {
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6e635c';
        ctx.beginPath();
        ctx.arc(rx - 1, ry - 1, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1816';
      });
    } else if (type === 'brick') {
      // Red-brownish brick rows
      ctx.strokeStyle = '#1d1f18';
      ctx.lineWidth = 2;
      const brickH = 32;
      const brickW = 64;
      for (let y = 0; y < size; y += brickH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
        
        const offset = (y / brickH) % 2 === 0 ? 0 : brickW / 2;
        for (let x = offset; x < size + brickW; x += brickW) {
          ctx.beginPath();
          ctx.moveTo(x % size, y);
          ctx.lineTo(x % size, y + brickH);
          ctx.stroke();
        }
      }
      // Add mossy green tint spots
      ctx.fillStyle = 'rgba(64,80,36,0.3)';
      for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 10 + Math.random() * 20, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'cyber') {
      // Futuristic neon grids
      ctx.fillStyle = '#06000c';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#d633ff';
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }
      // Neon glow spots
      ctx.fillStyle = '#00f0ff';
      for (let i = 0; i < size; i += 64) {
        ctx.fillRect(i + 30, i + 30, 4, 4);
      }
    } else if (type === 'carpet') {
      // Level 0 Carpet: dense tiny particles
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 4000; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 3000; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
      }
      // Water stains
      ctx.fillStyle = 'rgba(100, 85, 55, 0.2)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 8 + Math.random() * 24, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'wood') {
      // Wood boards
      const boardH = 64;
      ctx.strokeStyle = '#1e1b12';
      ctx.lineWidth = 3;
      for (let y = 0; y < size; y += boardH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
        
        // Draw wood grain lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 15);
        ctx.bezierCurveTo(size * 0.25, y + 5, size * 0.75, y + 25, size, y + 15);
        ctx.moveTo(0, y + 45);
        ctx.bezierCurveTo(size * 0.25, y + 55, size * 0.75, y + 35, size, y + 45);
        ctx.stroke();
        ctx.strokeStyle = '#1e1b12';
        ctx.lineWidth = 3;
      }
    } else if (type === 'circus') {
      // Circus Red/White vertical stripes
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
      // Red and Yellow checkerboard floor
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
      // Matrix falling binary code
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
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
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

    const handleMouseDown = () => {
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
    const wallTex = createProceduralTexture(theme.wallTexture, theme.wallColor, true);
    const floorTex = createProceduralTexture(theme.floorTexture, theme.floorColor, false);
    const ceilTex = createProceduralTexture(theme.ceilingTexture, theme.ceilingColor, false);

    // Make textures repeat correctly
    wallTex.repeat.set(1, 1);
    floorTex.repeat.set(1.5, 1.5);
    ceilTex.repeat.set(1.5, 1.5);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.8,
      metalness: theme.wallTexture === 'metal' ? 0.8 : 0.1,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: theme.floorTexture === 'water' ? 0.05 : 0.9,
      metalness: theme.floorTexture === 'water' ? 0.3 : 0.05,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      map: ceilTex,
      roughness: 0.7,
    });

    // 4. Construct Room Geometries
    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, 3.5, CELL_SIZE);
    
    
    // Instanced or Grouped meshes
    const mazeGroup = new THREE.Group();
    scene.add(mazeGroup);

    // Floor and Ceiling planes
    const floorGeo = new THREE.PlaneGeometry(MAP_SIZE * CELL_SIZE, MAP_SIZE * CELL_SIZE);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set((MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, 0, (MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
    floorMesh.receiveShadow = true;
    mazeGroup.add(floorMesh);

    // Special Water Plane if water theme
    if (theme.floorTexture === 'water') {
      const waterGeo = new THREE.PlaneGeometry(MAP_SIZE * CELL_SIZE, MAP_SIZE * CELL_SIZE);
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: '#1a5f6e',
        transparent: true,
        opacity: 0.75,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.8,
        ior: 1.333,
      });
      const waterMesh = new THREE.Mesh(waterGeo, waterMat);
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.position.set((MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, 0.05, (MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
      mazeGroup.add(waterMesh);
    }

    const ceilMesh = new THREE.Mesh(floorGeo, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set((MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, 3.5, (MAP_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
    ceilMesh.receiveShadow = true;
    mazeGroup.add(ceilMesh);

    // Reset doors list
    doorsRef.current = [];

    // Door and tree materials
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: '#2d2319', roughness: 0.8 });
    const doorPanelMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.9, metalness: 0.1 });
    const handleMat = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.8, roughness: 0.2 });

    const leafMat = new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9 });

    // Setup light fixtures list and panel geometry
    const lightFixtures: THREE.PointLight[] = [];
    const ceilingLightsList: LightState[] = [];
    const lightPanelGeo = new THREE.PlaneGeometry(1.2, 1.2);

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

            if (isTropicalTheme || isNatureTheme) {
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
                // Palm tree / shrub
                if (isTropicalTheme) {
                  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 8), trunkMat);
                  trunk.position.y = 1.2; propGroup.add(trunk);
                  for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2;
                    const frond = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.25), leafMat);
                    frond.position.set(Math.cos(angle) * 0.6, 2.3, Math.sin(angle) * 0.6);
                    frond.rotation.set(0, angle, Math.PI / 8);
                    propGroup.add(frond);
                  }
                } else {
                  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 8), trunkMat);
                  trunk.position.y = 0.5;
                  const foliage = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), leafMat);
                  foliage.position.y = 1.5;
                  propGroup.add(trunk, foliage);
                }
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
                const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, CELL_SIZE, 8), new THREE.MeshStandardMaterial({ color: 0x776655, metalness: 0.8 }));
                pipe.rotation.x = Math.PI / 2; pipe.position.set(-1.9, 2.5, 0); propGroup.add(pipe);
              } else if (itemIndex === 1) {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x8d6e63, metalness: 0.7 }));
                barrel.position.y = 0.45; propGroup.add(barrel);
              } else {
                const fuseBox = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
                fuseBox.position.set(-1.92, 1.6, 0);
                const greenL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
                greenL.position.set(-1.86, 1.7, 0.1);
                const redL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                redL.position.set(-1.86, 1.5, 0.1);
                propGroup.add(fuseBox, greenL, redL);
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
              if (itemIndex === 0) {
                const trashCan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.5 }));
                trashCan.position.y = 0.25; propGroup.add(trashCan);
              } else if (itemIndex === 1) {
                const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.8 }));
                seat.position.y = 0.45;
                const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x424242 }));
                back.position.set(0, 0.75, -0.26);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 4), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 }));
                leg.position.set(0, 0.225, 0); propGroup.add(seat, back, leg);
              } else {
                const cardBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: 0xb59975 }));
                cardBox.position.y = 0.225; cardBox.rotation.y = Math.PI / 8; propGroup.add(cardBox);
              }
            }

            // Apply slight random offset to keep placement natural and out of exact center
            const offsetX = ((Math.sin(x * 12.3) * 100) % 1) * 0.8;
            const offsetZ = ((Math.sin(z * 45.7) * 100) % 1) * 0.8;
            propGroup.position.x += offsetX;
            propGroup.position.z += offsetZ;

            mazeGroup.add(propGroup);
          }
        }
      }
    }

    // 5. Environmental Lighting Setup
    const ambientLight = new THREE.AmbientLight(
      theme.lightingStyle === 'flashlight-only' ? 0x111111 : 0x666666
    );
    scene.add(ambientLight);

    // Directional subtle fog glow
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.15);
    sunLight.position.set(10, 20, 10);
    scene.add(sunLight);

    if (theme.lightingStyle !== 'flashlight-only') {
      const intensity = theme.lightingStyle === 'red-alarm' ? 2.5 : theme.lightingStyle === 'white-sterile' ? 2.0 : 1.5;
      const color = theme.lightingStyle === 'red-alarm' ? 0xff0000 : theme.lightingStyle === 'neon' ? 0x00ffff : 0xfffae0;
      const glowColor = theme.lightingStyle === 'red-alarm' ? 0xff3333 : theme.lightingStyle === 'neon' ? 0x00f0ff : 0xffffe0;

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

            const light = new THREE.PointLight(color, intensity, 10, 1.5);
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


    // 6. Spawn Flashlight (Spotlight) attached to camera
    const flashlight = new THREE.SpotLight(0xffffff, 5.0, 24, Math.PI / 5, 0.5, 1.0);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    scene.add(flashlight);
    flashlightRef.current = flashlight;

    // 7. Spawn Theme Specific Props (Pipes, Cabinets, Lockers, Water puddles)
    const spawnProps = () => {
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

      const createMannequinMesh = (color: THREE.ColorRepresentation) => {
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
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 8), standMat);
        pole.position.set(0, 0.4, 0);
        group.add(pole);

        // Legs
        const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 8), mat);
        leftLeg.position.set(-0.07, 0.35, 0);
        leftLeg.castShadow = true;
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 8), mat);
        rightLeg.position.set(0.07, 0.35, 0);
        rightLeg.castShadow = true;
        group.add(rightLeg);
        
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
            
            const mannequin = createMannequinMesh(color);
            
            // Random offset within the cell boundaries to prevent wall clipping
            const offX = (Math.abs(Math.sin(attemptSeed * 11.3)) % 1 - 0.5) * 1.2;
            const offZ = (Math.abs(Math.sin(attemptSeed * 17.7)) % 1 - 0.5) * 1.2;
            mannequin.position.set(x * CELL_SIZE + offX, 0, z * CELL_SIZE + offZ);
            
            // Random standing spin rotation
            mannequin.rotation.y = (Math.abs(Math.sin(attemptSeed * 25.1)) % 1) * Math.PI * 2;
            
            scene.add(mannequin);
            spawned++;
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

      if (noclipMode) {
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
      
      if (noclipMode) {
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
          }
        }
        camera.position.y = targetY; // lock player height or follow stair slope
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
  }, [theme, items, flashlightOn, noclipMode]);

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
    </div>
  );
};

export default ThreeCanvas;
