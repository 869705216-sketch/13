import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MagicState } from '../types';

const particleVertexShader = `
  uniform float uTime;
  uniform float uMix; // 0.0 = Chaos, 1.0 = Formed
  
  attribute vec3 aChaosPos;
  attribute vec3 aTargetPos;
  attribute float aSize;
  attribute float aColorType; // 0=Pink/White, 1=Gold
  
  varying vec3 vColor;
  
  void main() {
    // Interpolate position
    vec3 pos = mix(aChaosPos, aTargetPos, uMix);
    
    // Add some noise/floating movement based on time
    // Chaos has more noise, Formed has subtle "breathing"
    float noiseAmp = mix(0.5, 0.02, uMix); 
    
    pos.x += sin(uTime * 1.0 + pos.y * 0.5) * noiseAmp;
    pos.y += cos(uTime * 0.8 + pos.x * 0.5) * noiseAmp;
    pos.z += sin(uTime * 1.5 + pos.x) * noiseAmp; // Z-noise mostly for chaos
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size attenuation - fine particles
    // chaos: larger blobs, formed: fine dust
    float sizeMix = mix(1.2, 0.7, uMix);
    gl_PointSize = aSize * sizeMix * (120.0 / -mvPosition.z);
    
    // Twinkle effect
    float alpha = 0.5 + 0.5 * sin(uTime * 3.0 + aChaosPos.x * 10.0);
    
    // Color transition: Chaos (Cool White/Blue) -> Formed (Sakura Pink/Gold)
    vec3 colorChaos = vec3(0.8, 0.9, 1.0);
    
    vec3 colorFormed;
    
    if (aColorType > 0.5) {
        // GOLD (Moon & Stars)
        colorFormed = vec3(0.98, 0.8, 0.3); 
    } else {
        // PINK (Ring, Runes)
        colorFormed = vec3(0.98, 0.66, 0.83); 
    }
    
    vColor = mix(colorChaos, colorFormed, uMix) * alpha;
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  
  void main() {
    // Circular particle
    vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
    float dist = dot(circCoord, circCoord);
    if (dist > 1.0) {
      discard;
    }
    
    // Sharp core, soft glow
    float alpha = 1.0 - smoothstep(0.0, 1.0, dist); 
    // Boost alpha for brilliance
    alpha = pow(alpha, 1.5);
    
    gl_FragColor = vec4(vColor, alpha);
  }
`;

interface MagicParticlesProps {
  state: MagicState;
}

export const MagicParticles: React.FC<MagicParticlesProps> = ({ state }) => {
  const mesh = useRef<THREE.Points>(null);
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  
  // Lerp factor
  const currentMix = useRef(0);

  // High particle count for detailed layers
  const count = 45000;
  
  const { chaos, target, sizes, colors } = useMemo(() => {
    const chaosArray = new Float32Array(count * 3);
    const targetArray = new Float32Array(count * 3);
    const sizesArray = new Float32Array(count);
    const colorsArray = new Float32Array(count); // 0=Pink, 1=Gold

    const getCirclePoint = (r: number, angle: number) => ({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: 0
    });

    const getPentagramPoint = (r: number, index: number, offsetAngle: number = 0) => {
        const angle = (index * 2 * Math.PI / 5) + (Math.PI / 2) + offsetAngle;
        return getCirclePoint(r, angle);
    };

    const lerpPoint = (p1: {x:number, y:number}, p2: {x:number, y:number}, t: number) => ({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
        z: 0
    });

    const starPath = [0, 2, 4, 1, 3, 0]; 

    for (let i = 0; i < count; i++) {
      // --- CHAOS POSITION ---
      const r = 20 * Math.cbrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      
      chaosArray[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      chaosArray[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      chaosArray[i * 3 + 2] = r * Math.cos(phi);

      // --- TARGET POSITION (The Shape) ---
      let tx=0, ty=0, tz=0;
      let colorType = 0; // 0=Pink, 1=Gold
      
      const p = Math.random();
      
      // LEFT MOON (CSG REJECTION SAMPLING) - 15%
      // Body Center: -4.85, Radius: 1.65
      // Cutout Center: -3.6, Radius: 1.35
      let isMoon = false;
      if (p < 0.15) {
          let found = false;
          let attempts = 0;
          while (!found && attempts < 10) {
              const mr = Math.sqrt(Math.random()) * 1.65; // Area uniform
              const ma = Math.random() * Math.PI * 2;
              const mx = -4.85 + Math.cos(ma) * mr;
              const my = 0 + Math.sin(ma) * mr;
              
              // Check cutout
              const dx = mx - (-3.6);
              const dy = my - 0;
              const distCutout = Math.sqrt(dx*dx + dy*dy);
              
              if (distCutout > 1.35) {
                  tx = mx; ty = my; tz = 0;
                  found = true;
                  colorType = 1; // Gold Moon
                  isMoon = true;
              }
              attempts++;
          }
      }

      if (!isMoon) {
          // LAYER 1: Large Upright Pentagram (R=6.5) - 10%
          if (p < 0.25) {
            colorType = 1;
            const segment = Math.floor(Math.random() * 5);
            const idxA = starPath[segment];
            const idxB = starPath[segment + 1];
            const ptA = getPentagramPoint(6.5, idxA);
            const ptB = getPentagramPoint(6.5, idxB);
            const t = Math.random();
            const pt = lerpPoint(ptA, ptB, t);
            tx = pt.x; ty = pt.y; tz = pt.z;
          }
          // LAYER 2: Middle Inverted Pentagram (R=3.5) - 10%
          else if (p < 0.35) {
            colorType = 1;
            const segment = Math.floor(Math.random() * 5);
            const idxA = starPath[segment];
            const idxB = starPath[segment + 1];
            // Offset angle by PI/5 (36 degrees) to invert
            const ptA = getPentagramPoint(3.5, idxA, Math.PI); 
            const ptB = getPentagramPoint(3.5, idxB, Math.PI);
            const t = Math.random();
            const pt = lerpPoint(ptA, ptB, t);
            tx = pt.x; ty = pt.y; tz = pt.z;
          }
          // LAYER 3: Outer Ring (R=6.5) - 20%
          else if (p < 0.55) {
              colorType = 0;
              const angle = Math.random() * Math.PI * 2;
              const pt = getCirclePoint(6.5, angle);
              tx = pt.x; ty = pt.y; tz = pt.z;
          }
          // LAYER 4: Middle Ring (R=3.5) - 15%
          else if (p < 0.70) {
              colorType = 0;
              const angle = Math.random() * Math.PI * 2;
              const pt = getCirclePoint(3.5, angle);
              tx = pt.x; ty = pt.y; tz = pt.z;
          }
          // LAYER 5: Inner Ring (R=1.2) - 10%
          else if (p < 0.80) {
              colorType = 1;
              const angle = Math.random() * Math.PI * 2;
              const pt = getCirclePoint(1.2, angle);
              tx = pt.x; ty = pt.y; tz = pt.z;
          }
          // Fill/Dust
          else {
              colorType = 0;
              const r = Math.random() * 6.0;
              const a = Math.random() * Math.PI * 2;
              tx = Math.cos(a) * r;
              ty = Math.sin(a) * r;
          }
      }
      
      targetArray[i * 3] = tx;
      targetArray[i * 3 + 1] = ty;
      targetArray[i * 3 + 2] = tz;
      
      sizesArray[i] = Math.random() * 0.4 + 0.1;
      colorsArray[i] = colorType;
    }

    return {
      chaos: chaosArray,
      target: targetArray,
      sizes: sizesArray,
      colors: colorsArray
    };
  }, []);

  useFrame((stateObj, delta) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = stateObj.clock.elapsedTime;
      
      const targetVal = state === MagicState.FORMED ? 1.0 : 0.0;
      // Increased Lerp speed (3.0) for snappier response
      currentMix.current = THREE.MathUtils.lerp(currentMix.current, targetVal, delta * 3.0);
      
      shaderRef.current.uniforms.uMix.value = currentMix.current;
      
      if (mesh.current && currentMix.current > 0.5) {
          mesh.current.rotation.z -= delta * 0.02;
      }
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={chaos}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aChaosPos"
          count={count}
          array={chaos}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aTargetPos"
          count={count}
          array={target}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={count}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aColorType"
          count={count}
          array={colors}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={shaderRef}
        vertexShader={particleVertexShader}
        fragmentShader={particleFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uMix: { value: 0 }
        }}
      />
    </points>
  );
};