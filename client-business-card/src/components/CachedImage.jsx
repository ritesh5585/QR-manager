import { useEffect, useState } from "react";
import axios from "axios";

const EXPIRY_DURATION_MS = 1000 * 60 * 60 * 24; // 24 hours

export default function CachedImage({ imageKey, className }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const cacheKey = `image-url-${imageKey}`;
    const rawCache = localStorage.getItem(cacheKey);
    let cachedData = null;

    try {
      cachedData = JSON.parse(rawCache);
    } catch {
      // Ignore invalid JSON
    }

    const isExpired = !cachedData || (Date.now() - cachedData.timestamp) > EXPIRY_DURATION_MS;

    if (!isExpired) {
      setUrl(cachedData.url);
    } else {
      axios
        .get(`${import.meta.env.VITE_S3_URL}/downloadObjectqwiq/${imageKey}`)
        .then((res) => {
          const imageUrl = res.data?.downloadUrl?.url;
          if (imageUrl) {
            setUrl(imageUrl);
            const newCache = {
              url: imageUrl,
              timestamp: Date.now()
            };
            localStorage.setItem(cacheKey, JSON.stringify(newCache));
          }
        })
        .catch((err) => {
          console.error("Failed to fetch image URL:", err);
        });
    }
  }, [imageKey]);

  if (!url) {
    return (
      <div
        className={`bg-gray-200 animate-pulse rounded ${className || "w-full h-48"}`}
      />
    );
  }

  return <img src={url} alt="Cached" loading="lazy" className={className} />;
}
