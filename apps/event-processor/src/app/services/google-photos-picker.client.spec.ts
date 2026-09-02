import {
  planMediaDownload,
  planThumbnailDownload,
  getVideoProcessingStatus,
  isVideoReady,
  PickedMediaItem,
} from './google-photos-picker.client';

function makeItem(overrides: Partial<PickedMediaItem['mediaFile']> = {}, type: 'PHOTO' | 'VIDEO' = 'PHOTO'): PickedMediaItem {
  return {
    id: 'media-1',
    createTime: '2026-01-01T00:00:00Z',
    type,
    mediaFile: {
      baseUrl: 'https://example.com/base',
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
      ...overrides,
    },
  };
}

describe('planMediaDownload', () => {
  test('HEIC photo with recorded dimensions is resized (converting it to JPEG)', () => {
    const item = makeItem({ mimeType: 'image/heic', mediaFileMetadata: { width: 3024, height: 4032 } });
    const plan = planMediaDownload(item);
    expect(plan).toEqual({
      url: 'https://example.com/base=w3024-h4032',
      resultingMimeType: 'image/jpeg',
      originalMimeType: 'image/heic',
    });
  });

  test('HEIF photo with recorded dimensions is resized the same as HEIC', () => {
    const item = makeItem({ mimeType: 'image/heif', mediaFileMetadata: { width: 100, height: 200 } });
    const plan = planMediaDownload(item);
    expect(plan).toEqual({
      url: 'https://example.com/base=w100-h200',
      resultingMimeType: 'image/jpeg',
      originalMimeType: 'image/heif',
    });
  });

  test('HEIC photo without recorded dimensions falls back to a plain download', () => {
    const item = makeItem({ mimeType: 'image/heic', mediaFileMetadata: {} });
    const plan = planMediaDownload(item);
    expect(plan).toEqual({ url: 'https://example.com/base=d', resultingMimeType: 'image/heic' });
  });

  test('HEIC photo with no mediaFileMetadata at all falls back to a plain download', () => {
    const item = makeItem({ mimeType: 'image/heic' });
    const plan = planMediaDownload(item);
    expect(plan).toEqual({ url: 'https://example.com/base=d', resultingMimeType: 'image/heic' });
  });

  test('non-HEIC photo always uses a plain download', () => {
    const item = makeItem({ mimeType: 'image/jpeg', mediaFileMetadata: { width: 100, height: 200 } });
    const plan = planMediaDownload(item);
    expect(plan).toEqual({ url: 'https://example.com/base=d', resultingMimeType: 'image/jpeg' });
  });

  test('video uses the =dv suffix (readiness gating happens in asset-transform.ts, not here)', () => {
    const item = makeItem({ mimeType: 'video/mp4' }, 'VIDEO');
    const plan = planMediaDownload(item);
    expect(plan).toEqual({ url: 'https://example.com/base=dv', resultingMimeType: 'video/mp4' });
  });
});

describe('getVideoProcessingStatus / isVideoReady', () => {
  test('READY status is read from mediaFileMetadata.videoMetadata.processingStatus', () => {
    const item = makeItem({ mimeType: 'video/mp4', mediaFileMetadata: { videoMetadata: { processingStatus: 'READY' } } }, 'VIDEO');
    expect(getVideoProcessingStatus(item)).toBe('READY');
    expect(isVideoReady(item)).toBe(true);
  });

  test('PROCESSING status is not ready', () => {
    const item = makeItem({ mimeType: 'video/mp4', mediaFileMetadata: { videoMetadata: { processingStatus: 'PROCESSING' } } }, 'VIDEO');
    expect(getVideoProcessingStatus(item)).toBe('PROCESSING');
    expect(isVideoReady(item)).toBe(false);
  });

  test('FAILED status is not ready', () => {
    const item = makeItem({ mimeType: 'video/mp4', mediaFileMetadata: { videoMetadata: { processingStatus: 'FAILED' } } }, 'VIDEO');
    expect(isVideoReady(item)).toBe(false);
  });

  test('missing videoMetadata is not ready', () => {
    const item = makeItem({ mimeType: 'video/mp4', mediaFileMetadata: {} }, 'VIDEO');
    expect(getVideoProcessingStatus(item)).toBeUndefined();
    expect(isVideoReady(item)).toBe(false);
  });

  test('missing mediaFileMetadata entirely is not ready', () => {
    const item = makeItem({ mimeType: 'video/mp4' }, 'VIDEO');
    expect(getVideoProcessingStatus(item)).toBeUndefined();
    expect(isVideoReady(item)).toBe(false);
  });
});

describe('planThumbnailDownload', () => {
  test('uses recorded width/height when present', () => {
    const item = makeItem({ mimeType: 'video/mp4', mediaFileMetadata: { width: 1920, height: 1080 } }, 'VIDEO');
    const plan = planThumbnailDownload(item);
    expect(plan).toEqual({ url: 'https://example.com/base=w1920-h1080', resultingMimeType: 'image/jpeg' });
  });

  test('falls back to a default size when width/height are missing', () => {
    const item = makeItem({ mimeType: 'video/mp4' }, 'VIDEO');
    const plan = planThumbnailDownload(item);
    expect(plan).toEqual({ url: 'https://example.com/base=w512-h512', resultingMimeType: 'image/jpeg' });
  });
});
