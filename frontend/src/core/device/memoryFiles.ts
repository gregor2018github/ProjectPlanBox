/** Device files kept in memory: for tests, and browsers without OPFS. */
import type { DeviceFiles } from "./server";

/** A `DeviceFiles` that forgets everything when the page closes. */
export class MemoryFiles implements DeviceFiles {
  private readonly folders = new Map<string, Map<string, Uint8Array>>();

  private folder(name: string): Map<string, Uint8Array> {
    let found = this.folders.get(name);
    if (found === undefined) {
      found = new Map();
      this.folders.set(name, found);
    }
    return found;
  }

  list(folder: string): Promise<{ name: string; size: number }[]> {
    return Promise.resolve(
      [...this.folder(folder)].map(([name, data]) => ({ name, size: data.length })),
    );
  }

  read(folder: string, name: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.folder(folder).get(name) ?? null);
  }

  write(folder: string, name: string, data: Uint8Array): Promise<void> {
    this.folder(folder).set(name, data.slice());
    return Promise.resolve();
  }

  remove(folder: string, name: string): Promise<void> {
    this.folder(folder).delete(name);
    return Promise.resolve();
  }
}
