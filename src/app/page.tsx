'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Aircraft } from '@/lib/opensky';
import { fetchAircraftClient } from '@/lib/client-fetch';
import InfoPanel from '@/components/InfoPanel';
import Controls from '@/components/Controls';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Loader2, Radio, AlertTriangle } from 'lucide-react';

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <span className="text-gray-400 text-sm">Loading globe...</span>
      </div>
    </div>
  ),
});

const ALL_CATEGORIES = new Set<Aircraft['category']>([
  'commercial', 'cargo', 'private', 'military', 'unknown'
]);

const REFRESH_INTERVAL = 15000; // 15s - OpenSky updates ~every 10s

export default function Home() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [filters, setFilters] = useState<Set<Aircraft['category']>>(new Set(ALL_CATEGORIES));
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAircraftClient();
      
      setAircraft(data.aircraft);
      setLastUpdate(data.time);
      
      // Update selected aircraft if still exists
      if (selectedAircraft) {
        const updated = data.aircraft.find(
          (a: Aircraft) => a.icao24 === selectedAircraft.icao24
        );
        if (updated) setSelectedAircraft(updated);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'RATE_LIMITED') {
        setError('Rate limited by OpenSky. Backing off for 30s...');
        // Back off - clear interval, wait 30s, restart
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => {
          fetchData();
          intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
        }, 30000);
      } else {
        setError('Failed to fetch aircraft data. Retrying...');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedAircraft]);

  // Initial load + polling
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Splash screen
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleToggleFilter = useCallback((cat: Aircraft['category']) => {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleLocate = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => console.error('Geolocation error:', err)
      );
    }
  }, []);

  const handleSelect = useCallback((a: Aircraft) => {
    setSelectedAircraft(prev => prev?.icao24 === a.icao24 ? null : a);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      {/* Splash screen */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <Radio className="w-16 h-16 text-cyan-400" />
                <motion.div
                  animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-full border-2 border-cyan-400/30"
                />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Flight<span className="text-cyan-400">Radar</span>
              </h1>
              <p className="text-gray-400 text-sm">Real-time aircraft tracking</p>
              <div className="flex items-center gap-2 mt-2">
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-gray-500 text-xs">Connecting to OpenSky Network...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title bar */}
      <div className="absolute top-4 left-4 z-10">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="flex items-center gap-3 bg-gray-900/80 backdrop-blur-md rounded-xl border border-gray-700/50 px-4 py-2.5"
        >
          <Radio className="w-5 h-5 text-cyan-400" />
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">
              Flight<span className="text-cyan-400">Radar</span>
            </h1>
            <p className="text-[10px] text-gray-500">Live ADS-B Tracking</p>
          </div>
        </motion.div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-red-900/80 backdrop-blur-md rounded-lg border border-red-700/50 px-4 py-2"
          >
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-red-200 text-sm">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Globe */}
      <Globe
        aircraft={aircraft}
        selectedId={selectedAircraft?.icao24 || null}
        selectedAircraft={selectedAircraft}
        onSelect={handleSelect}
        filters={filters}
        userLocation={userLocation}
      />

      {/* Info panel */}
      <InfoPanel
        aircraft={selectedAircraft}
        onClose={() => setSelectedAircraft(null)}
      />

      {/* Controls */}
      <Controls
        filters={filters}
        onToggleFilter={handleToggleFilter}
        onLocate={handleLocate}
        onRefresh={fetchData}
        aircraftCount={aircraft.filter(a => filters.has(a.category)).length}
        lastUpdate={lastUpdate}
        isLoading={isLoading}
      />
    </div>
  );
}
