import { parseBlob } from "music-metadata-browser";

export async function readTrackMeta(file: File) {
  try {
    const metadata = await parseBlob(file);
    const title =
      metadata.common.title ||
      file.name.replace(/\.[^/.]+$/, "");
    const artist = metadata.common.artist || "";
    const album = metadata.common.album || "";
    return { title, artist, album, duration: metadata.format.duration || 0 };
  } catch {
    const title = file.name.replace(/\.[^/.]+$/, "");
    return { title, artist: "", album: "", duration: 0 };
  }
}