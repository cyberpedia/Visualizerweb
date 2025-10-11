import { parseBlob } from "music-metadata-browser";

export async function readTrackMeta(file: File) {
  try {
    const metadata = await parseBlob(file);
    const title =
      metadata.common.title ||
      file.name.replace(/\.[^/.]+$/, "");
    const artist = metadata.common.artist || "";
    const album = metadata.common.album || "";
    let artUrl: string | null = null;
    const pic = metadata.common.picture?.[0];
    if (pic) {
      try {
        const blob = new Blob([pic.data], { type: pic.format || "image/jpeg" });
        artUrl = URL.createObjectURL(blob);
      } catch {}
    }
    return { title, artist, album, duration: metadata.format.duration || 0, artUrl };
  } catch {
    const title = file.name.replace(/\.[^/.]+$/, "");
    return { title, artist: "", album: "", duration: 0, artUrl: null };
  }
}