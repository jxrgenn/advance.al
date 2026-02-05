import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

interface SceneProps {
  scrollProgress: number;
  environmentImage?: string | null;
}

// Actual Linear Stairs
const Staircase = () => {
  const stepCount = 12;
  const steps = useMemo(() => {
    return new Array(stepCount).fill(0).map((_, i) => ({
      position: [2, i * 0.6, -i * 1.5] as [number, number, number], // Ascending backwards and up
      scale: [5, 0.4, 1.5] as [number, number, number], // Wide steps
    }));
  }, []);

  return (
    <group position={[3, -2, 0]}>
      {steps.map((step, i) => (
        <mesh 
          key={i} 
          position={step.position} 
          castShadow 
          receiveShadow
        >
          <boxGeometry args={step.scale} />
          <meshPhysicalMaterial
            color="#ffffff" 
            emissive="#eff6ff"
            emissiveIntensity={0.1}
            roughness={0.1}
            metalness={0.1}
            transmission={0.6} // Glassy
            thickness={2}
            clearcoat={1}
          />
        </mesh>
      ))}
      
      {/* Side rail/wall for visual weight */}
      <mesh position={[4.6, 1.5, -8]} rotation={[0.4, 0, 0]} receiveShadow>
         <boxGeometry args={[0.2, 12, 20]} />
         <meshStandardMaterial color="#f1f5f9" roughness={0.2} />
      </mesh>
    </group>
  );
};

// Camera Controller that moves up the stairs
const ScrollyCamera = ({ scrollProgress }: { scrollProgress: number }) => {
  const { camera } = useThree();
  const vec = new THREE.Vector3();

  useFrame(() => {
    // 1. Define Start Position (Looking at bottom of stairs)
    const startPos = new THREE.Vector3(0, 0, 8);
    const startLookAt = new THREE.Vector3(3, 0, 0);

    // 2. Define End Position (Top of stairs, looking down/forward)
    // We move the camera up (y) and forward into the screen (z negative)
    const endPos = new THREE.Vector3(2, 5, -5); 
    const endLookAt = new THREE.Vector3(5, 5, -15);

    // 3. Interpolate based on scrollProgress
    // Use simple ease-out for smoother feel
    const ease = 1 - Math.pow(1 - scrollProgress, 3);

    camera.position.lerpVectors(startPos, endPos, ease);
    
    // Calculate current lookAt target
    const currentLookAt = vec.lerpVectors(startLookAt, endLookAt, ease);
    camera.lookAt(currentLookAt);
  });

  return null;
};

const StairsScene: React.FC<SceneProps> = ({ scrollProgress, environmentImage }) => {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault fov={45} />
        <ScrollyCamera scrollProgress={scrollProgress} />
        
        {/* Lighting Setup */}
        <ambientLight intensity={0.5} />
        <spotLight 
          position={[10, 15, 10]} 
          angle={0.5} 
          penumbra={1} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-5, 2, 5]} intensity={0.5} color="#60a5fa" />
        
        {/* Backlight for the top of stairs */}
        <rectAreaLight position={[0, 10, -10]} width={10} height={10} color="#3b82f6" intensity={5} />

        {/* Dynamic Environment */}
        {environmentImage ? (
           <Environment background={false} files={environmentImage} path="" />
        ) : (
           <Environment preset="city" blur={1} />
        )}
        
        {/* Environment backdrop plane */}
        {environmentImage && (
             <mesh position={[0, 5, -20]} scale={[40, 30, 1]}>
                <planeGeometry />
                <meshBasicMaterial map={new THREE.TextureLoader().load(environmentImage)} transparent opacity={0.3} />
             </mesh>
        )}

        <Staircase />
        
        {/* Ground Shadows */}
        <ContactShadows position={[3, -2.1, 0]} opacity={0.4} scale={20} blur={2} far={10} color="#1e40af" />
        
        {/* Background */}
        <color attach="background" args={['#f8fafc']} />
        <fog attach="fog" args={['#f8fafc', 5, 30]} />
      </Canvas>
    </div>
  );
};

export default StairsScene;
