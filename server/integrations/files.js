import { fileIdFromUrl, readFile } from '../storage/index.js';

const realFetch = globalThis.fetch;

/** Bytes for a portal file URL (read straight from storage) or any external URL. */
export async function fetchFileBytes(url) {
  const id = fileIdFromUrl(url);
  if (id) {
    const f = await readFile(id);
    return { buffer: f.buffer, mime: f.mime, name: f.name };
  }
  const res = await realFetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || '', name: decodeURIComponent(url.split('?')[0].split('/').pop() || '') };
}

/**
 * Backend functions ported from Base44 call `fetch(doc.file_url)`. Portal file URLs are protected by
 * login, so serve them straight from storage instead of making an HTTP round trip to ourselves.
 */
export function installFetchInterceptor() {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    const id = url && (!init?.method || init.method === 'GET') ? fileIdFromUrl(url) : null;
    if (id) {
      try {
        const f = await readFile(id);
        return new Response(f.buffer, { status: 200, headers: { 'Content-Type': f.mime } });
      } catch (e) {
        return new Response(String(e.message), { status: 404 });
      }
    }
    return realFetch(input, init);
  };
}
