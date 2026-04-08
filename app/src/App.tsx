import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import FilterBar from './components/filters/FilterBar';

// #11: lazy-load the heavy map component (MapLibre + PMTiles)
const MapView = lazy(() => import('./components/map/Map'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen w-screen overflow-hidden flex flex-col">
        <Header />
        <div className="flex-1 relative" style={{ marginTop: '56px' }}>
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-500">
                Loading map...
              </div>
            }
          >
            <MapView />
          </Suspense>
          <Sidebar />
          <FilterBar />
        </div>
      </div>
    </QueryClientProvider>
  );
}
