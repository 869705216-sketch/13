import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MagicState } from '../types';

interface MagicOrnamentsProps {
  state: MagicState;
}

const tempObject = new THREE.Object3D();
const tempPos = new THREE.Vector3();

export const MagicOrnaments: React.FC<MagicOrnamentsProps> = ({ state }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 20; 

  const data = useMemo(() => {
    const chaosPositions: THREE.Vector3[] = [];
    const targetPositions: THREE.Vector3[] = [];
    const rotationSpeeds: number[] = [];
    
    // 0-4: Upright Pentagram Tips (R=6.5)
    // 5-9: Inverted Pentagram Tips (R=3.5)
    // 10-19: Randomly on Outer Ring
    
    const getPentagramPoint = (r: number, index: number, offset: number = 0) => {
        const angle = (index * 2 * Math.PI / 5) + (Math.PI / 2) + offset;
        return { x: Math.cos(angle)*r, y: Math.sin(angle)*r };
    };

    for (let i = 0; i < count; i++) {
      chaosPositions.push(new THREE.Vector3(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20
      ));

      let tx = 0, ty = 0;
      
      if (i < 5) {
        // Outer Star
        const pt = getPentagramPoint(6.5, i);
        tx = pt.x; ty = pt.y;
      } else if (i < 10) {
        // Inner Inverted Star
        const pt = getPentagramPoint(3.5, i - 5, Math.PI);
        tx = pt.x; ty = pt.y;
      } else {
        // Ring Accents
        const angle = Math.random() * Math.PI * 2;
        tx = Math.cos(angle) * 6.5;
        ty = Math.sin(angle) * 6.5;
      }
      
      targetPositions.push(new THREE.Vector3(tx, ty, 0));
      rotationSpeeds.push(Math.random() * 0.02 + 0.01);
    }
    return { chaosPositions, targetPositions, rotationSpeeds };
  }, [count]);

  const currentMix = useRef(0);

  useLayoutEffect(() => {
     if(meshRef.current) {
         for(let i=0; i<count; i++) {
             tempObject.position.copy(data.chaosPositions[i]);
             tempObject.updateMatrix();
             meshRef.current.setMatrixAt(i, tempObject.matrix);
         }
         meshRef.current.instanceMatrix.needsUpdate = true;
     }
  }, [data]);

  useFrame((stateObj, delta) => {
    if (!meshRef.current) return;

    const targetVal = state === MagicState.FORMED ? 1.0 : 0.0;
    // Faster Lerp
    currentMix.current = THREE.MathUtils.lerp(currentMix.current, targetVal, delta * 3.0);
    
    const t = stateObj.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      tempPos.lerpVectors(data.chaosPositions[i], data.targetPositions[i], currentMix.current);
      
      const floatZ = Math.sin(t * 2.0 + i) * 0.2 * (1 - currentMix.current * 0.5); 
      tempObject.position.set(tempPos.x, tempPos.y, tempPos.z + floatZ);
      
      tempObject.rotation.x = Math.sin(t + i) * 0.5;
      tempObject.rotation.y += data.rotationSpeeds[i];
      
      const scaleBase = 0.5;
      const scalePulse = state === MagicState.FORMED ? (1 + Math.sin(t * 4 + i) * 0.1) : 1;
      const finalScale = scaleBase * scalePulse;
      
      tempObject.scale.set(finalScale, finalScale, finalScale);

      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    if (currentMix.current > 0.9) {
         meshRef.current.rotation.z -= delta * 0.02; 
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial 
        color="#ffffff" 
        emissive="#ffccdd" 
        emissiveIntensity={1.2} 
        roughness={0.1} 
        metalness={0.9} 
      />
    </instancedMesh>
  );
};