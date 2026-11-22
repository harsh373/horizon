import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { JournalPhoto } from "../api/journalPhotos.api";
import { formatLongDate } from "../config/dates";
import type { DayKey } from "../config/dates";
import EncryptedImage from "./EncryptedImage";

interface JournalLightboxProps {
  photo: JournalPhoto;
  day: DayKey;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

// Read-only viewer for one journal day. It is rendered through a portal into <body> so that
// `fixed inset-0` is relative to the real screen, not to a transformed page wrapper.
export default function JournalLightbox({ photo, day, onClose, onPrev, onNext }: JournalLightboxProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && onPrev) onPrev();
      if (event.key === "ArrowRight" && onNext) onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return createPortal(
    <div
      className="page-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        <X size={18} />
      </button>

      {onPrev && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrev();
          }}
          aria-label="Previous photo"
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {onNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          aria-label="Next photo"
          className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div className="mx-4 flex max-h-[85vh] flex-col items-center" onClick={(event) => event.stopPropagation()}>
        {/* The box is sized from the stored dimensions, so it doesn't jump while the photo decrypts. */}
        <div
          style={{
            aspectRatio: `${photo.width} / ${photo.height}`,
            height: "70vh",
            maxWidth: "min(900px, 92vw)",
          }}
        >
          <EncryptedImage
            kind="photo-full"
            recordId={photo.id}
            url={photo.fullUrl}
            alt={photo.caption}
            className="h-full w-full rounded-[14px] object-contain shadow-window"
          />
        </div>
        <div className="mt-4 w-full text-center">
          {photo.caption && <p className="text-[15px] leading-relaxed text-white">{photo.caption}</p>}
          <p className="mt-1 text-[13px] text-white/60">{formatLongDate(day)}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}