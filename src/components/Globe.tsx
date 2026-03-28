'use client';

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Aircraft, latLngAltToVector3, CATEGORY_COLORS } from '@/lib/opensky';

const GLOBE_RADIUS = 2;

// Earth sphere with high-res NASA texture
function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/earth-blue-marble.jpg');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);
  
  const bumpMap = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return loader.load('/earth-topology.png');
  }, []);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
      <meshPhongMaterial
        map={texture}
        bumpMap={bumpMap}
        bumpScale={0.03}
        specular={new THREE.Color(0x222222)}
        shininess={8}
      />
    </mesh>
  );
}

// Atmosphere glow
function Atmosphere() {
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
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        transparent
      />
    </mesh>
  );
}

// Aircraft renderer using instanced mesh + custom click detection
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
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useMemo(() => new THREE.Vector2(), []);
  
  const filtered = useMemo(
    () => aircraft.filter(a => filters.has(a.category)),
    [aircraft, filters]
  );

  // Pre-compute 3D positions for click detection
  const positions = useMemo(
    () => filtered.map(a => {
      const [x, y, z] = latLngAltToVector3(a.lat, a.lng, a.altitude / 1000, GLOBE_RADIUS);
      return new THREE.Vector3(x, y, z);
    }),
    [filtered]
  );
  
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Update instanced mesh
  useEffect(() => {
    if (!instancedRef.current || filtered.length === 0) return;
    
    const colors = new Float32Array(filtered.length * 3);
    
    filtered.forEach((a, i) => {
      dummy.position.copy(positions[i]);
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
    instancedRef.current.computeBoundingSphere();
  }, [filtered, selectedId, dummy, positions]);

  // Custom click handler: project aircraft positions to screen space and find closest to click
  const handlePointerDown = useRef<{ x: number; y: number } | null>(null);
  
  useEffect(() => {
    const canvas = gl.domElement;
    
    const onDown = (e: PointerEvent) => {
      handlePointerDown.current = { x: e.clientX, y: e.clientY };
    };
    
    const onUp = (e: PointerEvent) => {
      if (!handlePointerDown.current) return;
      
      // Only fire click if mouse didn't move much (not a drag)
      const dx = e.clientX - handlePointerDown.current.x;
      const dy = e.clientY - handlePointerDown.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        handlePointerDown.current = null;
        return;
      }
      handlePointerDown.current = null;
      
      const rect = canvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const clickY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Project all aircraft positions to screen space and find closest
      let bestDist = Infinity;
      let bestIdx = -1;
      
      const projected = new THREE.Vector3();
      
      for (let i = 0; i < positions.length; i++) {
        projected.copy(positions[i]);
        projected.project(camera);
        
        // Check if on visible side of globe (z < 1 in NDC)
        if (projected.z > 1) continue;
        
        const dist = Math.sqrt(
          (projected.x - clickX) ** 2 + 
          (projected.y - clickY) ** 2
        );
        
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      
      // Threshold in NDC space - roughly 20px at typical viewport size
      const threshold = 40 / Math.min(rect.width, rect.height);
      
      if (bestIdx >= 0 && bestDist < threshold) {
        onSelect(filtered[bestIdx]);
      }
    };
    
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, positions, filtered, onSelect]);

  if (filtered.length === 0) return null;

  return (
    <instancedMesh
      ref={instancedRef}
      args={[undefined, undefined, filtered.length]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.014, 6, 6]} />
      <meshBasicMaterial vertexColors />
    </instancedMesh>
  );
}

// Selected aircraft glow ring
function SelectedGlow({
  aircraft,
}: {
  aircraft: Aircraft | null;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  
  const position = useMemo(() => {
    if (!aircraft) return null;
    return latLngAltToVector3(aircraft.lat, aircraft.lng, aircraft.altitude / 1000, GLOBE_RADIUS);
  }, [aircraft]);
  
  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 3;
    }
  });

  if (!aircraft || !position) return null;
  
  const color = CATEGORY_COLORS[aircraft.category];

  return (
    <group position={position}>
      {/* Bright centre */}
      <mesh>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
      {/* Spinning ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.05, 0.06, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
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

// Scene
function Scene({
  aircraft,
  selectedId,
  selectedAircraft,
  onSelect,
  filters,
  userLocation,
}: {
  aircraft: Aircraft[];
  selectedId: string | null;
  selectedAircraft: Aircraft | null;
  onSelect: (a: Aircraft) => void;
  filters: Set<Aircraft['category']>;
  userLocation: { lat: number; lng: number } | null;
}) {
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
      
      <SelectedGlow aircraft={selectedAircraft} />
      
      {userLocation && (
        <UserLocation lat={userLocation.lat} lng={userLocation.lng} />
      )}
      
      <OrbitControls
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
  selectedAircraft,
  onSelect,
  filters,
  userLocation,
}: {
  aircraft: Aircraft[];
  selectedId: string | null;
  selectedAircraft: Aircraft | null;
  onSelect: (a: Aircraft) => void;
  filters: Set<Aircraft['category']>;
  userLocation: { lat: number; lng: number } | null;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ width: '100%', height: '100%', background: '#000' }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <Scene
        aircraft={aircraft}
        selectedId={selectedId}
        selectedAircraft={selectedAircraft}
        onSelect={onSelect}
        filters={filters}
        userLocation={userLocation}
      />
    </Canvas>
  );
}
