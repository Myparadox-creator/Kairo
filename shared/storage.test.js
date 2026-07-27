import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteCapsules } from './storage.js';

describe('deleteCapsules', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it('removes only the specified ids', async () => {
    const existing = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    chrome.storage.local.get.mockResolvedValue({ kairo_capsules: existing });

    const result = await deleteCapsules(['a', 'c']);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      kairo_capsules: [{ id: 'b' }],
    });
  });

  it('is a no-op if none of the ids exist', async () => {
    const existing = [{ id: 'x' }, { id: 'y' }];
    chrome.storage.local.get.mockResolvedValue({ kairo_capsules: existing });

    const result = await deleteCapsules(['a', 'b']);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(0);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      kairo_capsules: existing,
    });
  });
});
