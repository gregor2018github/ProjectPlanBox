/**
 * Device files in the browser's origin private file system (OPFS), next
 * to the database: backups and the sync state. In the Android app this is
 * the app's private storage, which only uninstalling removes.
 */
import type { DeviceFiles } from "./server";

/** Files under one OPFS folder (`planbox/<folder>/<name>`). */
export class OpfsFiles implements DeviceFiles {
  constructor(private readonly root = "planbox") {}

  private async folder(name: string): Promise<FileSystemDirectoryHandle> {
    const top = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle(this.root, {
      create: true,
    });
    return top.getDirectoryHandle(name, { create: true });
  }

  async list(folder: string): Promise<{ name: string; size: number }[]> {
    const dir = await this.folder(folder);
    const found: { name: string; size: number }[] = [];
    // `entries()` is in every OPFS implementation, but not yet in TypeScript's DOM types.
    const entries = (
      dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }
    ).entries();
    for await (const [name, handle] of entries) {
      if (handle.kind === "file") {
        found.push({ name, size: (await (handle as FileSystemFileHandle).getFile()).size });
      }
    }
    return found;
  }

  async read(folder: string, name: string): Promise<Uint8Array | null> {
    try {
      const file = await (await (await this.folder(folder)).getFileHandle(name)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  async write(folder: string, name: string, data: Uint8Array): Promise<void> {
    const dir = await this.folder(folder);
    // A temporary file first, renamed when complete: a crash never leaves a
    // half-written file under the real name.
    const partial = await dir.getFileHandle(`${name}.partial`, { create: true });
    const writable = await partial.createWritable();
    await writable.write(data as BlobPart);
    await writable.close();
    await this.remove(folder, name);
    await (partial as FileSystemFileHandle & { move(name: string): Promise<void> }).move(name);
  }

  async remove(folder: string, name: string): Promise<void> {
    try {
      await (await this.folder(folder)).removeEntry(name);
    } catch {
      // Already gone.
    }
  }
}
