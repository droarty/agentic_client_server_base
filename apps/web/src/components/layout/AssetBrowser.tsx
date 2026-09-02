import { useEffect, useState, type ComponentType } from 'react';
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
  transformStatus: string;
  createdAt: string;
  addedByEmail: string;
}

function isMediaType(assetType: string) {
  return assetType === 'google_photo' || assetType === 'google_video';
}

// Google's photo-viewer page, not a raw media URL — doesn't work as an
// img/video src (confirmed by testing). Kept as a "view on Google Photos"
// link alongside the inline preview below, which now renders our own
// persisted copy (sourceUrl) instead.
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

export function AssetBrowser({ assets, selectedAsset, onSelect }: Props) {
  const assetList = Array.isArray(assets) ? (assets as AssetDto[]) : [];
  const selected = (selectedAsset as AssetDto | null | undefined) ?? null;

  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    setPreviewFailed(false);
  }, [selected?.publicId]);

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
                    <span className="asset-status">{asset.transformStatus}</span>
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
            <h3>
              {selected.sourceId ? (
                <a href={googlePhotoViewUrl(selected.sourceId)} target="_blank" rel="noopener noreferrer">
                  {selected.name ?? '(untitled)'}
                </a>
              ) : (
                selected.name ?? '(untitled)'
              )}
            </h3>
            <dl>
              <dt>Type</dt>
              <dd>{selected.assetType}</dd>
              <dt>Added</dt>
              <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
              <dt>Added by</dt>
              <dd>{selected.addedByEmail}</dd>
            </dl>
            {isMediaType(selected.assetType) && (
              <div className="asset-preview">
                {selected.transformStatus === 'downloading' ? (
                  <div className="asset-preview-placeholder">
                    <p>Processing…</p>
                  </div>
                ) : selected.transformStatus === 'failed' ? (
                  <div className="asset-preview-placeholder">
                    <p>Import failed — see raw metadata for details.</p>
                  </div>
                ) : selected.sourceUrl && !previewFailed ? (
                  selected.assetType === 'google_video' ? (
                    <video src={selected.sourceUrl} controls onError={() => setPreviewFailed(true)} />
                  ) : (
                    <img src={selected.sourceUrl} alt={selected.name ?? ''} style={{ maxWidth: '400px' }} onError={() => setPreviewFailed(true)} />
                  )
                ) : (
                  <div className="asset-preview-placeholder">
                    {(() => {
                      const Icon = iconForAssetType(selected.assetType);
                      return <Icon size={48} />;
                    })()}
                    <p>Preview unavailable.</p>
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
