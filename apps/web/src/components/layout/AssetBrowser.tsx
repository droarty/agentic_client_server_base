import { Asset, iconForAssetType, type AssetDto } from './Asset';
import { TwoColumnPanel } from './TwoColumnPanel';
import { JsonView } from './JsonView';

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
            <div className="asset-preview-frame">
              <Asset asset={selected} />
            </div>
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
