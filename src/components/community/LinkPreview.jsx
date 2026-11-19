import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text?.match(urlRegex) || [];
}

function PreviewCard({ url }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(res => {
        if (res.status === "success") setData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) {
    return (
      <div className="mt-3 border rounded-xl p-3 bg-gray-50 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-2 bg-gray-200 rounded w-2/3" />
      </div>
    );
  }

  if (!data) return null;

  const domain = (() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex gap-3 border rounded-xl overflow-hidden bg-white hover:bg-gray-50 transition-colors no-underline block"
    >
      {data.image?.url && (
        <img
          src={data.image.url}
          alt=""
          className="w-24 h-24 object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1 p-3 min-w-0">
        <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
          <ExternalLink className="w-3 h-3" /> {domain}
        </p>
        {data.title && (
          <p className="text-sm font-semibold text-gray-900 line-clamp-2">{data.title}</p>
        )}
        {data.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{data.description}</p>
        )}
      </div>
    </a>
  );
}

export default function LinkPreview({ content }) {
  const urls = extractUrls(content);
  if (!urls.length) return null;

  // Show preview only for the first URL
  return <PreviewCard url={urls[0]} />;
}