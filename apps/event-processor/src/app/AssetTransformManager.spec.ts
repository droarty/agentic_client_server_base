jest.mock('./services/asset-transform');

import { runAssetTransform } from './services/asset-transform';
import { AssetTransformManager, AssetTransformJob } from './AssetTransformManager';
import { PickedMediaItem } from './services/google-photos-picker.client';

const mockedRunAssetTransform = jest.mocked(runAssetTransform);
const flushPromises = () => new Promise(setImmediate);

const handleInboundEvent = jest.fn().mockResolvedValue(undefined);
const logWorkflowStep = jest.fn();

const ITEM: PickedMediaItem = {
  id: 'media-1',
  createTime: '2026-01-01T00:00:00Z',
  type: 'PHOTO',
  mediaFile: { baseUrl: 'https://example.com/base', mimeType: 'image/jpeg', filename: 'photo.jpg' },
};

function makeJob(overrides: Partial<AssetTransformJob> = {}): AssetTransformJob {
  return {
    channel: 'ch-1',
    user: { id: 'user-1', email: 'user@test.com' },
    assetId: 42,
    item: ITEM,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AssetTransformManager', () => {
  test('on success, re-enters the workflow with an asset-transform-completed message', async () => {
    mockedRunAssetTransform.mockResolvedValue({
      id: 42, publicId: 'public-1', sourceUrl: 'http://localhost:8787/objects/key', transformStatus: 'done', metadata: { mediaType: 'image/jpeg' },
    } as never);

    new AssetTransformManager({ db: {} as never, handleInboundEvent, logWorkflowStep }).publish(makeJob());
    await flushPromises();

    expect(mockedRunAssetTransform).toHaveBeenCalledWith({}, 'user-1', 42, ITEM);
    expect(handleInboundEvent).toHaveBeenCalledWith({
      message: expect.objectContaining({
        type: 'asset-transform-completed',
        channel: 'ch-1',
        assetPublicId: 'public-1',
        sourceUrl: 'http://localhost:8787/objects/key',
        transformStatus: 'done',
        metadata: { mediaType: 'image/jpeg' },
      }),
      user: { id: 'user-1', email: 'user@test.com' },
    });
    expect(logWorkflowStep).not.toHaveBeenCalled();
  });

  test('on failure, still re-enters the workflow (with transformStatus: failed) instead of throwing', async () => {
    mockedRunAssetTransform.mockResolvedValue({
      id: 42, publicId: 'public-1', sourceUrl: null, transformStatus: 'failed', metadata: { transformErrors: ['boom'] },
    } as never);

    new AssetTransformManager({ db: {} as never, handleInboundEvent, logWorkflowStep }).publish(makeJob());
    await flushPromises();

    expect(handleInboundEvent).toHaveBeenCalledWith({
      message: expect.objectContaining({ type: 'asset-transform-completed', transformStatus: 'failed', sourceUrl: null }),
      user: { id: 'user-1', email: 'user@test.com' },
    });
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error', channel: 'ch-1' }));
  });

  test('publish does not throw synchronously even if the transform rejects unexpectedly', () => {
    mockedRunAssetTransform.mockRejectedValue(new Error('unexpected'));
    expect(() => new AssetTransformManager({ db: {} as never, handleInboundEvent, logWorkflowStep }).publish(makeJob())).not.toThrow();
  });
});
