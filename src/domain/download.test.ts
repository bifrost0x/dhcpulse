import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from './download';

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the blob URL alive until the browser has accepted an attached download link', () => {
    vi.useFakeTimers();
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:package');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function clickDownload(this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe('01-Preflight.ps1');
      expect(this.href).toBe('blob:package');
      expect(revokeObjectUrl).not.toHaveBeenCalled();
    });

    downloadTextFile('Write-Host Ready', '01-Preflight.ps1', 'text/plain;charset=utf-8');

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="01-Preflight.ps1"]')).toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:package');
  });
});
