import { useStore } from '../../stores';
import type { Filters } from '../../utils/filters';

const DATE_PRESETS = [
  { label: 'Last 7 days', value: daysAgo(7) },
  { label: 'Last month', value: daysAgo(30) },
  { label: 'Last year', value: daysAgo(365) },
];

const PLATFORMS = [
  { label: 'Satellite', value: 'satellite' },
  { label: 'UAV/Drone', value: 'uav' },
  { label: 'Aircraft', value: 'aircraft' },
];

const RESOLUTIONS = [
  { label: '< 0.5m', value: '<0.5' },
  { label: '0.5 - 2m', value: '0.5-2' },
  { label: '2 - 10m', value: '2-10' },
  { label: '> 10m', value: '>10' },
];

export default function FilterBar() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);

  const update = (partial: Partial<Filters>) => {
    setFilters({ ...filters, ...partial });
  };

  const hasActiveFilters = filters.dateStart || filters.platform || filters.resolution || filters.license;

  return (
    <div className="absolute top-16 left-[372px] right-4 z-20 flex items-center gap-2 overflow-x-auto py-2 px-1 no-scrollbar">
      {/* Date presets */}
      {DATE_PRESETS.map((preset) => (
        <Chip
          key={preset.label}
          label={preset.label}
          active={filters.dateStart === preset.value}
          onClick={() =>
            update({
              dateStart: filters.dateStart === preset.value ? '' : preset.value,
              dateEnd: filters.dateStart === preset.value ? '' : today(),
            })
          }
        />
      ))}

      <Divider />

      {/* Platforms */}
      {PLATFORMS.map((plat) => (
        <Chip
          key={plat.value}
          label={plat.label}
          active={filters.platform === plat.value}
          onClick={() =>
            update({ platform: filters.platform === plat.value ? '' : plat.value })
          }
        />
      ))}

      <Divider />

      {/* Resolutions */}
      {RESOLUTIONS.map((res) => (
        <Chip
          key={res.value}
          label={res.label}
          active={filters.resolution === res.value}
          onClick={() =>
            update({ resolution: filters.resolution === res.value ? '' : res.value })
          }
        />
      ))}

      {/* Clear all */}
      {hasActiveFilters && (
        <>
          <Divider />
          <button
            onClick={() =>
              setFilters({
                dateStart: '',
                dateEnd: '',
                platform: '',
                resolution: '',
                license: '',
              })
            }
            className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-full transition-colors"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
        ${
          active
            ? 'bg-[#d73f3f] text-white border-[#d73f3f]'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 shadow-sm'
        }
      `}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 flex-shrink-0" />;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
