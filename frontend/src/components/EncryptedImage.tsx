import { useEffect, useState } from "react";
import { acquireImage } from "../crypto/imageCache";
import type { ImageKind } from "../crypto/imageCache";

interface EncryptedImageProps {
  kind: ImageKind;
  recordId: string;
  url: string;
  alt?: string;
  className?: string;
}

// Downloads the encrypted file, decrypts it in the browser and shows it. Nothing readable ever
// touches Cloudinary or the network.
export default function EncryptedImage({ kind, recordId, url, alt = "", className = "" }: EncryptedImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setFailed(false);

    const handle = acquireImage(kind, recordId, url);
    handle.promise
      .then((objectUrl) => {
        if (active) setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      handle.release();
    };
  }, [kind, recordId, url]);

  if (failed) {
    return (
      <div className={"flex items-center justify-center bg-surface text-[12px] text-tertiary " + className}>
        Couldn&apos;t load
      </div>
    );
  }

  if (!src) return <div className={"animate-pulse bg-hover " + className} aria-hidden="true" />;

  return <img src={src} alt={alt} className={className} draggable={false} />;
}