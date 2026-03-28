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

// Custom shader for crisp circular points with glow
const pointVertexShader = `
  attribute vec3 color;
  attribute float selected;
  varying vec3 vColor;
  varying float vSelected;
  
  void main() {
    vColor = color;
    vSelected = selected;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Scale point size based on distance (closer = bigger)
    float size = selected > 0.5 ? 12.0 : 6.0;
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 2.0, 24.0);
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const pointFragmentShader = `
  varying vec3 vColor;
  varying float vSelected;
  
  void main() {
    // Distance from centre of point (0 to 1)
    float d = length(gl_PointCoord - vec2(0.5));
    
    // Crisp circle with soft edge
    float alpha = 1.0 - smoothstep(0.35, 0.5, d);
    
    if (alpha < 0.01) discard;
    
    // Glow effect for selected
    vec3 col = vColor;
    if (vSelected > 0.5) {
      float glow = 1.0 - smoothstep(0.0, 0.5, d);
      col = mix(col, vec3(1.0), glow * 0.3);
      alpha = max(alpha, (1.0 - smoothstep(0.2, 0.5, d)) * 0.6);
    }
    
    gl_FragColor = vec4(col, alpha);
  }
`;

// Aircraft renderer using Points (GPU shader circles) + custom click detection
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
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, gl } = useThree();
  
  const filtered = useMemo(
    () => aircraft.filter(a => filters.has(a.category)),
    [aircraft, filters]
  );

  // Pre-compute 3D positions
  const positions = useMemo(
    () => filtered.map(a => {
      const [x, y, z] = latLngAltToVector3(a.lat, a.lng, a.altitude / 1000, GLOBE_RADIUS);
      return new THREE.Vector3(x, y, z);
    }),
    [filtered]
  );

  // Build geometry with positions, colors, and selected attribute
  useEffect(() => {
    if (!pointsRef.current || filtered.length === 0) return;
    
    const geo = pointsRef.current.geometry;
    const posArray = new Float32Array(filtered.length * 3);
    const colorArray = new Float32Array(filtered.length * 3);
    const selectedArray = new Float32Array(filtered.length);
    
    filtered.forEach((a, i) => {
      posArray[i * 3] = positions[i].x;
      posArray[i * 3 + 1] = positions[i].y;
      posArray[i * 3 + 2] = positions[i].z;
      
      const col = new THREE.Color(CATEGORY_COLORS[a.category]);
      colorArray[i * 3] = col.r;
      colorArray[i * 3 + 1] = col.g;
      colorArray[i * 3 + 2] = col.b;
      
      selectedArray[i] = a.icao24 === selectedId ? 1.0 : 0.0;
    });
    
    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.setAttribute('selected', new THREE.BufferAttribute(selectedArray, 1));
    geo.computeBoundingSphere();
  }, [filtered, selectedId, positions]);

  // Custom click handler: screen-space proximity
  const handlePointerDown = useRef<{ x: number; y: number } | null>(null);
  
  useEffect(() => {
    const canvas = gl.domElement;
    
    const onDown = (e: PointerEvent) => {
      handlePointerDown.current = { x: e.clientX, y: e.clientY };
    };
    
    const onUp = (e: PointerEvent) => {
      if (!handlePointerDown.current) return;
      
      const dx = e.clientX - handlePointerDown.current.x;
      const dy = e.clientY - handlePointerDown.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        handlePointerDown.current = null;
        return;
      }
      handlePointerDown.current = null;
      
      const rect = canvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const clickY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      let bestDist = Infinity;
      let bestIdx = -1;
      const projected = new THREE.Vector3();
      
      for (let i = 0; i < positions.length; i++) {
        projected.copy(positions[i]);
        projected.project(camera);
        
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
      
      const threshold = 50 / Math.min(rect.width, rect.height);
      
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
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry />
      <shaderMaterial
        vertexShader={pointVertexShader}
        fragmentShader={pointFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
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
