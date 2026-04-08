import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../stores';
import ImageCard from '../imagery/ImageCard';
import { SIDEBAR_PAGE_SIZE } from '../../utils/constants';

export default function Sidebar() {
  const features = useStore((s) => s.features);
  const selectedFeature = useStore((s) => s.selectedFeature);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);

  const [visibleCount, setVisibleCount] = useState(SIDEBAR_PAGE_SIZE);
  const listRef = useRef<HTMLDivElement>(null);
  const prevFeaturesRef = useRef('');

  // Reset scroll when features change (but not on selection)
  useEffect(() => {
    const ids = features
      .slice(0, 100)
      .map((f) => f.properties._id)
      .join(',');
    if (ids !== prevFeaturesRef.current) {
      prevFeaturesRef.current = ids;
      setVisibleCount(SIDEBAR_PAGE_SIZE);
      if (!selectedFeature && listRef.current) {
        listRef.current.scrollTop = 0;
      }
    }
  }, [features, selectedFeature]);

  // #6: expand visible count to include selected item, then scroll to it
  useEffect(() => {
    if (!selectedFeature || !listRef.current) return;
    const selectedId = selectedFeature.properties._id as string;
    const idx = features.findIndex((f) => f.properties._id === selectedId);
    if (idx >= 0 && idx >= visibleCount) {
      setVisibleCount(idx + 1);
    }
    // Wait for render then scroll
    requestAnimationFrame(() => {
      const el = document.getElementById(`card-${selectedId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [selectedFeature, features, visibleCount]);

  const visibleFeatures = features.slice(0, visibleCount);
  const hasMore = features.length > visibleCount;

  if (!sidebarOpen) {
    return (
      <button
        onClick={() => setSidebarOpen(true)}
        className="absolute top-20 left-4 z-20 bg-white shadow-lg rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Show panel ({features.length})
      </button>
    );
  }

  return (
    <div className="absolute top-0 left-0 bottom-0 w-[360px] z-10 flex flex-col bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#d73f3f] rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">OAM</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              OpenAerialMap
            </div>
            <div className="text-xs text-gray-500">
              {features.length} image{features.length !== 1 ? 's' : ''} in view
            </div>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Feature list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {features.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
            <div className="text-2xl mb-2">🌍</div>
            <div>Pan and zoom to discover imagery</div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {visibleFeatures.map((f) => (
              <div key={f.properties._id as string} id={`card-${f.properties._id}`}>
                <ImageCard feature={f} />
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + SIDEBAR_PAGE_SIZE)}
                className="mx-auto mt-2 mb-4 px-4 py-2 text-sm font-medium text-[#d73f3f] hover:bg-red-50 rounded-lg transition-colors"
              >
                Load more ({features.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
