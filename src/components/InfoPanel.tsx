'use client';

import { Aircraft, CATEGORY_COLORS } from '@/lib/opensky';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane, X, ArrowUp, ArrowDown, Minus, MapPin, Gauge,
  Mountain, Navigation, Globe, Tag
} from 'lucide-react';

function VerticalIndicator({ rate }: { rate: number }) {
  if (rate > 1) return <ArrowUp className="w-4 h-4 text-green-400" />;
  if (rate < -1) return <ArrowDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function formatAltitude(metres: number): string {
  const feet = Math.round(metres * 3.28084);
  if (feet >= 10000) return `${(feet / 1000).toFixed(1)}k ft`;
  return `${feet.toLocaleString()} ft`;
}

function formatSpeed(ms: number): string {
  const knots = Math.round(ms * 1.94384);
  return `${knots} kts`;
}

function formatVerticalRate(ms: number): string {
  const fpm = Math.round(ms * 196.85);
  if (fpm > 0) return `+${fpm} fpm`;
  return `${fpm} fpm`;
}

export default function InfoPanel({
  aircraft,
  onClose,
}: {
  aircraft: Aircraft | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {aircraft && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          className="absolute top-0 right-0 h-full w-80 bg-gray-900/95 backdrop-blur-md border-l border-gray-700/50 z-20 overflow-y-auto"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane
                  className="w-5 h-5"
                  style={{ color: CATEGORY_COLORS[aircraft.category] }}
                />
                <h2 className="text-lg font-bold text-white">
                  {aircraft.callsign || 'Unknown'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-700/50 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="px-2 py-0.5 rounded text-xs font-medium capitalize"
                style={{
                  backgroundColor: CATEGORY_COLORS[aircraft.category] + '20',
                  color: CATEGORY_COLORS[aircraft.category],
                }}
              >
                {aircraft.category}
              </span>
              <span className="text-xs text-gray-400">
                {aircraft.icao24.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="p-4 space-y-4">
            {/* Origin */}
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-500">Origin Country</div>
                <div className="text-sm text-white">{aircraft.originCountry}</div>
              </div>
            </div>

            {/* Position */}
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-500">Position</div>
                <div className="text-sm text-white font-mono">
                  {aircraft.lat.toFixed(4)}°, {aircraft.lng.toFixed(4)}°
                </div>
              </div>
            </div>

            {/* Altitude */}
            <div className="flex items-center gap-3">
              <Mountain className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs text-gray-500">Altitude</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">
                    {formatAltitude(aircraft.altitude)}
                  </span>
                  <VerticalIndicator rate={aircraft.verticalRate} />
                  <span className="text-xs text-gray-400">
                    {formatVerticalRate(aircraft.verticalRate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-3">
              <Gauge className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-500">Ground Speed</div>
                <div className="text-sm text-white">
                  {formatSpeed(aircraft.velocity)}
                  <span className="text-gray-400 text-xs ml-1">
                    ({Math.round(aircraft.velocity * 3.6)} km/h)
                  </span>
                </div>
              </div>
            </div>

            {/* Heading */}
            <div className="flex items-center gap-3">
              <Navigation
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                style={{ transform: `rotate(${aircraft.heading}deg)` }}
              />
              <div>
                <div className="text-xs text-gray-500">Heading</div>
                <div className="text-sm text-white">
                  {Math.round(aircraft.heading)}°
                  <span className="text-gray-400 text-xs ml-1">
                    ({getCardinal(aircraft.heading)})
                  </span>
                </div>
              </div>
            </div>

            {/* Altitude bar */}
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">Altitude Profile</div>
              <div className="relative h-32 bg-gray-800/50 rounded-lg overflow-hidden">
                {/* Altitude zones */}
                <div className="absolute inset-0 flex flex-col justify-between py-2 px-3">
                  <span className="text-[10px] text-gray-600">45,000 ft</span>
                  <span className="text-[10px] text-gray-600">30,000 ft</span>
                  <span className="text-[10px] text-gray-600">15,000 ft</span>
                  <span className="text-[10px] text-gray-600">Ground</span>
                </div>
                {/* Current altitude marker */}
                <div
                  className="absolute left-0 right-0 h-0.5 transition-all duration-500"
                  style={{
                    bottom: `${Math.min((aircraft.altitude * 3.28084) / 45000, 1) * 100}%`,
                    backgroundColor: CATEGORY_COLORS[aircraft.category],
                    boxShadow: `0 0 8px ${CATEGORY_COLORS[aircraft.category]}`,
                  }}
                >
                  <div
                    className="absolute -top-2 right-2 text-xs font-mono px-1 rounded"
                    style={{ color: CATEGORY_COLORS[aircraft.category] }}
                  >
                    {formatAltitude(aircraft.altitude)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
