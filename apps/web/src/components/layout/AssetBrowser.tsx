import { type ComponentType } from 'react';
import { Image, Video, File as FileIcon } from 'lucide-react';
import { TwoColumnPanel } from './TwoColumnPanel';
import { JsonView } from './JsonView';

interface AssetDto {
  publicId: string;
  assetType: string;
  name: string | null;
  sourceUrl: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// Google's photo-viewer link renders the actual image inline — sidesteps the
// baseUrl's Authorization-header requirement entirely (see the "baseUrl
// requires Authorization: Bearer" note this preview used to be blocked by).
function googlePhotoViewUrl(sourceId: string): string {
  return `https://photos.google.com/lr/photo/${sourceId}`;
}

interface Props {
  assets?: unknown;
  selectedAsset?: unknown;
  onSelect?: (payload: { selectedAsset: AssetDto }) => void;
  [key: string]: unknown;
}

// No existing convention maps a JSON-driven string prop to an icon component
// anywhere in this codebase — introduced fresh here. New asset types just add
// a row; anything not listed falls back to a generic file icon.
const ASSET_TYPE_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  google_photo: Image,
  google_video: Video,
};
const DEFAULT_ASSET_ICON = FileIcon;

function iconForAssetType(assetType: string) {
  return ASSET_TYPE_ICONS[assetType] ?? DEFAULT_ASSET_ICON;
}

function isMediaType(assetType: string) {
  return assetType === 'google_photo' || assetType === 'google_video';
}

export function AssetBrowser({ assets, selectedAsset, onSelect }: Props) {
  const assetList = Array.isArray(assets) ? (assets as AssetDto[]) : [];
  const selected = (selectedAsset as AssetDto | null | undefined) ?? null;

  return (
    <TwoColumnPanel
      left={
        assetList.length === 0 ? (
          <p className="asset-list-empty">No assets yet.</p>
        ) : (
          <ul className="asset-list">
            {assetList.map((asset) => {
              const Icon = iconForAssetType(asset.assetType);
              const isSelected = asset.publicId === selected?.publicId;
              return (
                <li key={asset.publicId} className={['asset-list-item', isSelected ? 'selected' : ''].filter(Boolean).join(' ')}>
                  <button type="button" onClick={() => onSelect?.({ selectedAsset: asset })}>
                    <Icon size={16} />
                    <span>{asset.name ?? '(untitled)'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      }
      right={
        !selected ? (
          <p className="asset-detail-empty">Select an asset to view details.</p>
        ) : (
          <div className="asset-detail">
            <h3>{selected.name ?? '(untitled)'}</h3>
            <dl>
              <dt>Type</dt>
              <dd>{selected.assetType}</dd>
              <dt>Added</dt>
              <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
            </dl>
            {isMediaType(selected.assetType) && (
              <div className="asset-preview">
                {selected.assetType === 'google_photo' && selected.sourceId ? (
                  <img src={googlePhotoViewUrl(selected.sourceId)} alt={selected.name ?? ''} />
                ) : selected.assetType === 'google_video' && selected.sourceUrl ? (
                  <video src={selected.sourceUrl} controls />
                ) : (
                  <div className="asset-preview-placeholder">
                    {(() => {
                      const Icon = iconForAssetType(selected.assetType);
                      return <Icon size={48} />;
                    })()}
                    <p>Preview unavailable — the source link may have expired.</p>
                  </div>
                )}
              </div>
            )}
            {selected.metadata && (
              <details className="asset-detail-metadata">
                <summary>Raw metadata</summary>
                <JsonView config={selected.metadata} />
              </details>
            )}
          </div>
        )
      }
    />
  );
}
