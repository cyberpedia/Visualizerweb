import { setJSON, getJSON } from "./db";

export type SavedTrack = {
  name: string;
  url: string;
  artist?: string;
  album?: string;
  duration?: number;
  artUrl?: string | null;
};

const KEY = "playlist";

export async function savePlaylist(list: SavedTrack[]) {
  try {
    await setJSON(KEY, list);
  } catch {}
}

export async function loadPlaylist(): Promise<SavedTrack[] | null> {
  try {
    const data = await getJSON<SavedTrack[]>(KEY);
    if (!Array.isArray(data)) return null;
    // Sanitize: only persist http(s) URLs to avoid blob: breakage
    return data.filter((t) => {
      try {
        const u = new URL(t.url);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
}