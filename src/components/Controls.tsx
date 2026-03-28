'use client';

import { Aircraft, CATEGORY_COLORS } from '@/lib/opensky';
import { motion } from 'framer-motion';
import { Filter, MapPin, RefreshCw, Plane, Activity } from 'lucide-react';

const CATEGORIES: { key: Aircraft['category']; label: string }[] = [
  { key: 'commercial', label: 'Commercial' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'private', label: 'Private' },
  { key: 'military', label: 'Military' },
  { key: 'unknown', label: 'Other' },
];

export default function Controls({
  filters,
  onToggleFilter,
  onLocate,
  onRefresh,
  aircraftCount,
  lastUpdate,
  isLoading,
}: {
  filters: Set<Aircraft['category']>;
  onToggleFilter: (cat: Aircraft['category']) => void;
  onLocate: () => void;
  onRefresh: () => void;
  aircraftCount: number;
  lastUpdate: number | null;
  isLoading: boolean;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-3">
      {/* Stats bar */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700/50 px-4 py-3"
      >
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-cyan-400" />
            <span className="text-white font-medium">{aircraftCount.toLocaleString()}</span>
            <span className="text-gray-400">tracked</span>
          </div>
          {lastUpdate && (
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-green-400" />
              <span className="text-gray-400 text-xs">
                {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Category filters */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700/50 p-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-400 font-medium">CATEGORIES</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(({ key, label }) => {
            const active = filters.has(key);
            return (
              <button
                key={key}
                onClick={() => onToggleFilter(key)}
                className={`
                  px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                  ${active
                    ? 'border border-current'
                    : 'bg-gray-800/50 text-gray-500 border border-gray-700/30'
                  }
                `}
                style={active ? {
                  color: CATEGORY_COLORS[key],
                  backgroundColor: CATEGORY_COLORS[key] + '15',
                  borderColor: CATEGORY_COLORS[key] + '40',
                } : undefined}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: active ? CATEGORY_COLORS[key] : '#555' }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-2"
      >
        <button
          onClick={onLocate}
          className="flex items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700/50 text-gray-300 hover:text-white hover:border-gray-600 transition-all text-xs"
        >
          <MapPin className="w-3.5 h-3.5" />
          My Location
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700/50 text-gray-300 hover:text-white hover:border-gray-600 transition-all text-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </motion.div>
    </div>
  );
}
