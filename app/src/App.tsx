import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import FilterBar from './components/filters/FilterBar';
import MapView from './components/map/Map';

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
          <MapView />
          <Sidebar />
          <FilterBar />
        </div>
      </div>
    </QueryClientProvider>
  );
}
