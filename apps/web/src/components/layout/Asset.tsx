import { useEffect, useState, type ComponentType } from 'react';
import { Image, Video, File as FileIcon } from 'lucide-react';

export interface AssetDto {
  publicId: string;
  assetType: string;
  name: string | null;
  sourceUrl: string | null;
  thumbnailSrc: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown> | null;
  transformStatus: string;
  createdAt: string;
  addedByEmail: string;
}

// No existing convention maps a JSON-driven string prop to an icon component
// anywhere in this codebase — introduced fresh here. New asset types just add
// a row; anything not listed falls back to a generic file icon.
const ASSET_TYPE_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  google_photo: Image,
  google_video: Video,
};
const DEFAULT_ASSET_ICON = FileIcon;

export function iconForAssetType(assetType: string) {
  return ASSET_TYPE_ICONS[assetType] ?? DEFAULT_ASSET_ICON;
}

type AssetMediaKind = 'image' | 'video';

const ASSET_MEDIA_KIND: Record<string, AssetMediaKind> = {
  google_photo: 'image',
  google_video: 'video',
};

interface Props {
  asset: AssetDto;
}

export function Asset({ asset }: Props) {
  const kind = ASSET_MEDIA_KIND[asset.assetType];

  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    setPreviewFailed(false);
  }, [asset.publicId]);

  if (!kind) return null;

  return (
    <div className="asset-preview">
      {asset.transformStatus === 'downloading' ? (
        <div className="asset-preview-placeholder">
          <p>Processing…</p>
        </div>
      ) : asset.transformStatus === 'failed' ? (
        <div className="asset-preview-placeholder">
          <p>Import failed — see raw metadata for details.</p>
        </div>
      ) : asset.sourceUrl && !previewFailed ? (
        kind === 'video' ? (
          <video
            className="asset-preview-media"
            src={asset.sourceUrl}
            poster={asset.thumbnailSrc ?? undefined}
            controls
            playsInline
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <img
            className="asset-preview-media"
            src={asset.sourceUrl}
            alt={asset.name ?? ''}
            onError={() => setPreviewFailed(true)}
          />
        )
      ) : (
        <div className="asset-preview-placeholder">
          {(() => {
            const Icon = iconForAssetType(asset.assetType);
            return <Icon size={48} />;
          })()}
          <p>Preview unavailable.</p>
        </div>
      )}
    </div>
  );
}
