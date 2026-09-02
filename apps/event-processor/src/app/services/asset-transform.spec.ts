jest.mock('./google-photos-picker.client', () => ({
  ...jest.requireActual('./google-photos-picker.client'),
  getValidAccessToken: jest.fn(),
  downloadPickedMediaItem: jest.fn(),
}));
jest.mock('./r2-storage.client', () => ({
  storageClient: { uploadObject: jest.fn() },
  getStorageObjectUrl: jest.fn(),
}));

import { getValidAccessToken, downloadPickedMediaItem, PickedMediaItem } from './google-photos-picker.client';
import { storageClient, getStorageObjectUrl } from './r2-storage.client';
import { runAssetTransform } from './asset-transform';

const mockedGetValidAccessToken = jest.mocked(getValidAccessToken);
const mockedDownload = jest.mocked(downloadPickedMediaItem);
const mockedUpload = jest.mocked(storageClient.uploadObject);
const mockedGetUrl = jest.mocked(getStorageObjectUrl);

const USER_ID = 'user-1';
const ASSET_ID = 42;

function makeItem(overrides: Partial<PickedMediaItem['mediaFile']> = {}): PickedMediaItem {
  return {
    id: 'media-1',
    createTime: '2026-01-01T00:00:00Z',
    type: 'PHOTO',
    mediaFile: { baseUrl: 'https://example.com/base', mimeType: 'image/jpeg', filename: 'photo.jpg', ...overrides },
  };
}

function makeDb(finalRow: Record<string, unknown>) {
  const returning = jest.fn().mockResolvedValue([finalRow]);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  const update = jest.fn().mockReturnValue({ set });
  return { db: { update } as never, set, where, returning };
}

describe('runAssetTransform', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('downloads, uploads, and marks the row done on success', async () => {
    mockedGetValidAccessToken.mockResolvedValue('valid-token');
    mockedDownload.mockResolvedValue(Buffer.from('bytes'));
    mockedGetUrl.mockReturnValue('http://localhost:8787/objects/google-photos%2Fuser-1%2Fmedia-1');
    const { db, set, where } = makeDb({ id: ASSET_ID, transformStatus: 'done', sourceUrl: 'http://localhost:8787/objects/google-photos%2Fuser-1%2Fmedia-1' });

    const row = await runAssetTransform(db, USER_ID, ASSET_ID, makeItem());

    expect(mockedDownload).toHaveBeenCalledWith('valid-token', 'https://example.com/base=d');
    expect(mockedUpload).toHaveBeenCalledWith('google-photos/user-1/media-1', Buffer.from('bytes'), 'image/jpeg');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ transformStatus: 'done', sourceUrl: expect.any(String) }));
    expect(where).toHaveBeenCalled();
    expect(row).toEqual(expect.objectContaining({ transformStatus: 'done' }));
  });

  test('HEIC conversion resizes instead of using =d and uploads as image/jpeg', async () => {
    mockedGetValidAccessToken.mockResolvedValue('valid-token');
    mockedDownload.mockResolvedValue(Buffer.from('bytes'));
    mockedGetUrl.mockReturnValue('http://localhost:8787/objects/key');
    const { db } = makeDb({ id: ASSET_ID, transformStatus: 'done' });

    await runAssetTransform(db, USER_ID, ASSET_ID, makeItem({ mimeType: 'image/heic', mediaFileMetadata: { width: 100, height: 200 } }));

    expect(mockedDownload).toHaveBeenCalledWith('valid-token', 'https://example.com/base=w100-h200');
    expect(mockedUpload).toHaveBeenCalledWith(expect.any(String), Buffer.from('bytes'), 'image/jpeg');
  });

  test('marks the row failed when Google Photos is not connected, without throwing', async () => {
    mockedGetValidAccessToken.mockResolvedValue(null);
    const { db, set } = makeDb({ id: ASSET_ID, transformStatus: 'failed' });

    const row = await runAssetTransform(db, USER_ID, ASSET_ID, makeItem());

    expect(mockedDownload).not.toHaveBeenCalled();
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ transformStatus: 'failed' }));
    expect(row).toEqual(expect.objectContaining({ transformStatus: 'failed' }));
  });

  test('marks the row failed when the download itself fails, without throwing', async () => {
    mockedGetValidAccessToken.mockResolvedValue('valid-token');
    mockedDownload.mockRejectedValue(new Error('network blip'));
    const { db, set } = makeDb({ id: ASSET_ID, transformStatus: 'failed' });

    const row = await runAssetTransform(db, USER_ID, ASSET_ID, makeItem());

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ transformStatus: 'failed' }));
    expect(row).toEqual(expect.objectContaining({ transformStatus: 'failed' }));
  });
});
