import { useEffect, useState } from "react";
import { localCover } from "../api";

/**
 * Cover art that resolves through the Rust-side disk cache, so the library
 * renders fully offline. Falls back to the remote URL while online.
 */
export default function CoverImage({
  url,
  alt,
  className = "",
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    localCover(url).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url || failed) {
    return (
      <div
        className={`${className} bg-surface-700 flex items-center justify-center text-slate-500 text-xs px-2 text-center`}
      >
        {failed ? alt : "…"}
      </div>
    );
  }
  return (
    <img
      src={src ?? url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
