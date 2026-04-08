import { useStore } from '../../stores';
import { getTmsUrl, getPreviewUrl, getCogUrl } from '../../utils/tiles';
import type { MapGeoJSONFeature } from 'maplibre-gl';

interface Props {
  feature: MapGeoJSONFeature;
}

export default function ImageCard({ feature }: Props) {
  const selectedFeature = useStore((s) => s.selectedFeature);
  const setSelectedFeature = useStore((s) => s.setSelectedFeature);
  const hoveredFeatureId = useStore((s) => s.hoveredFeatureId);

  const p = feature.properties as Record<string, unknown>;
  const isSelected = selectedFeature?.properties?._id === p._id;
  const isHovered = hoveredFeatureId === p._id;

  const cogUrl = getCogUrl(p);
  const thumbnailUrl = cogUrl ? getPreviewUrl(cogUrl, 256) : null;
  const tmsUrl = getTmsUrl(p);

  const dateStr = formatDate(p.acquisition_end as string || p.datetime as string || '');
  const provider = (p.provider as string) || (p.title as string) || 'Unknown';
  const platform = (p.platform as string) || '';
  const gsd = p.gsd ? `${Number(p.gsd).toFixed(2)}m` : '';
  const license = (p.license as string) || '';
  const fileSize = p.file_size ? formatFileSize(p.file_size as number) : '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFeature(isSelected ? null : feature);
  };

  const copyTms = () => {
    if (tmsUrl) navigator.clipboard.writeText(tmsUrl);
  };

  const openInId = () => {
    if (!tmsUrl || !feature.geometry) return;
    const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const url = `https://www.openstreetmap.org/edit?editor=id#map=16/${cy.toFixed(5)}/${cx.toFixed(5)}&background=custom:${encodeURIComponent(tmsUrl)}`;
    window.open(url, '_blank');
  };

  const openInJosm = () => {
    if (!tmsUrl || !feature.geometry) return;
    const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const josmUrl = `http://127.0.0.1:8111/imagery?title=OAM&type=tms&url=${encodeURIComponent(tmsUrl)}`;
    fetch(josmUrl).catch(() => {
      window.alert('JOSM does not appear to be running. Please start JOSM and enable Remote Control.');
    });
    // Also zoom JOSM to the image
    const zoomUrl = `http://127.0.0.1:8111/zoom?left=${Math.min(...lons)}&right=${Math.max(...lons)}&top=${Math.max(...lats)}&bottom=${Math.min(...lats)}`;
    setTimeout(() => fetch(zoomUrl).catch(() => {}), 500);
  };

  return (
    <div
      onClick={handleClick}
      className={`
        border-l-4 bg-white rounded-r shadow-sm cursor-pointer transition-all
        ${isSelected ? 'border-l-[#d73f3f] shadow-md' : isHovered ? 'border-l-[#ff6b6b] bg-gray-50' : 'border-l-transparent hover:border-l-gray-300 hover:bg-gray-50'}
      `}
    >
      {/* Compact view */}
      <div className="flex gap-3 p-3">
        {/* Thumbnail */}
        <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={provider}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              No preview
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{provider}</div>
          <div className="text-xs text-gray-500 mt-0.5">{dateStr}</div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {platform && (
              <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-medium uppercase">
                {platform}
              </span>
            )}
            {gsd && (
              <span className="inline-block px-1.5 py-0.5 bg-green-50 text-green-700 text-[10px] rounded font-medium">
                {gsd}
              </span>
            )}
            {license && (
              <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded font-medium">
                {license}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail (when selected) */}
      {isSelected && (
        <div className="border-t border-gray-100 px-3 pb-3">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
            {platform && <MetaRow label="Platform" value={platform} />}
            {gsd && <MetaRow label="Resolution" value={gsd} />}
            {(p.sensor as string) && <MetaRow label="Sensor" value={p.sensor as string} />}
            {fileSize && <MetaRow label="File size" value={fileSize} />}
            {license && <MetaRow label="License" value={license} />}
            {p._id != null && <MetaRow label="Image ID" value={String(p._id).slice(0, 16) + '...'} />}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {cogUrl && (
              <ActionButton onClick={() => window.open(cogUrl, '_blank')}>
                Download
              </ActionButton>
            )}
            {tmsUrl && (
              <ActionButton onClick={copyTms}>
                Copy TMS
              </ActionButton>
            )}
            {tmsUrl && (
              <ActionButton onClick={openInId}>
                Open in iD
              </ActionButton>
            )}
            {tmsUrl && (
              <ActionButton onClick={openInJosm}>
                JOSM
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium truncate">{value}</span>
    </>
  );
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
    >
      {children}
    </button>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Unknown date';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr.slice(0, 10);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
