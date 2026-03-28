'use client';

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Aircraft, latLngAltToVector3, CATEGORY_COLORS } from '@/lib/opensky';

const GLOBE_RADIUS = 2;

// Earth sphere with texture
function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return loader.load('https://unpkg.com/three-globe@2.34.0/example/img/earth-blue-marble.jpg');
  }, []);
  
  const bumpMap = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return loader.load('https://unpkg.com/three-globe@2.34.0/example/img/earth-topology.png');
  }, []);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <meshPhongMaterial
        map={texture}
        bumpMap={bumpMap}
        bumpScale={0.02}
        specular={new THREE.Color(0x333333)}
        shininess={5}
      />
    </mesh>
  );
}

// Atmosphere glow
function Atmosphere() {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  
  const vertexShader = `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  
  const fragmentShader = `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
    }
  `;

  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS * 1.015, 64, 64]} />
      <shaderMaterial
        ref={shaderRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        transparent
      />
    </mesh>
  );
}

// Individual aircraft point with direction indicator
function AircraftPoint({
  aircraft,
  isSelected,
  onSelect,
}: {
  aircraft: Aircraft;
  isSelected: boolean;
  onSelect: (a: Aircraft) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Line>(null);
  
  const position = useMemo(
    () => latLngAltToVector3(aircraft.lat, aircraft.lng, aircraft.altitude / 1000, GLOBE_RADIUS),
    [aircraft.lat, aircraft.lng, aircraft.altitude]
  );
  
  const color = CATEGORY_COLORS[aircraft.category];
  const size = isSelected ? 0.025 : 0.012;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(aircraft);
        }}
      >
        <sphereGeometry args={[size, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Glow effect for selected */}
      {isSelected && (
        <mesh position={position}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}

// All aircraft as instanced mesh for performance
function AircraftLayer({
  aircraft,
  selectedId,
  onSelect,
  filters,
}: {
  aircraft: Aircraft[];
  selectedId: string | null;
  onSelect: (a: Aircraft) => void;
  filters: Set<Aircraft['category']>;
}) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const colorRef = useRef<Float32Array>(null);
  
  const filtered = useMemo(
    () => aircraft.filter(a => filters.has(a.category)),
    [aircraft, filters]
  );
  
  // For large datasets, use instanced mesh
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  useEffect(() => {
    if (!instancedRef.current || filtered.length === 0) return;
    
    const colors = new Float32Array(filtered.length * 3);
    
    filtered.forEach((a, i) => {
      const pos = latLngAltToVector3(a.lat, a.lng, a.altitude / 1000, GLOBE_RADIUS);
      dummy.position.set(...pos);
      const s = a.icao24 === selectedId ? 2.5 : 1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedRef.current!.setMatrixAt(i, dummy.matrix);
      
      const col = new THREE.Color(CATEGORY_COLORS[a.category]);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    });
    
    instancedRef.current.instanceMatrix.needsUpdate = true;
    instancedRef.current.geometry.setAttribute(
      'color',
      new THREE.InstancedBufferAttribute(colors, 3)
    );
  }, [filtered, selectedId, dummy]);
  
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId;
    if (idx !== undefined && idx < filtered.length) {
      onSelect(filtered[idx]);
    }
  }, [filtered, onSelect]);

  if (filtered.length === 0) return null;

  return (
    <instancedMesh
      ref={instancedRef}
      args={[undefined, undefined, filtered.length]}
      onClick={handleClick}
    >
      <sphereGeometry args={[0.012, 6, 6]} />
      <meshBasicMaterial vertexColors />
    </instancedMesh>
  );
}

// User location pin
function UserLocation({ lat, lng }: { lat: number; lng: number }) {
  const position = useMemo(
    () => latLngAltToVector3(lat, lng, 0, GLOBE_RADIUS),
    [lat, lng]
  );
  const ringRef = useRef<THREE.Mesh>(null);
  
  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2;
    }
  });

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color="#ff6b6b" />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.03, 0.04, 32]} />
        <meshBasicMaterial color="#ff6b6b" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Scene wrapper with camera and controls
function Scene({
  aircraft,
  selectedId,
  onSelect,
  filters,
  userLocation,
}: {
  aircraft: Aircraft[];
  selectedId: string | null;
  onSelect: (a: Aircraft) => void;
  filters: Set<Aircraft['category']>;
  userLocation: { lat: number; lng: number } | null;
}) {
  const controlsRef = useRef(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <pointLight position={[-5, -3, -5]} intensity={0.3} />
      
      <Earth />
      <Atmosphere />
      <Stars radius={100} depth={50} count={5000} factor={4} />
      
      <AircraftLayer
        aircraft={aircraft}
        selectedId={selectedId}
        onSelect={onSelect}
        filters={filters}
      />
      
      {userLocation && (
        <UserLocation lat={userLocation.lat} lng={userLocation.lng} />
      )}
      
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={2.5}
        maxDistance={8}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

export default function Globe({
  aircraft,
  selectedId,
  onSelect,
  filters,
  userLocation,
}: {
  aircraft: Aircraft[];
  selectedId: string | null;
  onSelect: (a: Aircraft) => void;
  filters: Set<Aircraft['category']>;
  userLocation: { lat: number; lng: number } | null;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ width: '100%', height: '100%', background: '#000' }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene
        aircraft={aircraft}
        selectedId={selectedId}
        onSelect={onSelect}
        filters={filters}
        userLocation={userLocation}
      />
    </Canvas>
  );
}
