import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { deleteJournalPhoto, uploadJournalPhoto } from "../api/journalPhotos.api";
import type { JournalPhoto } from "../api/journalPhotos.api";
import type { DayKey } from "../config/dates";
import { PhotoError } from "../utility/preparePhoto";
import EncryptedImage from "./EncryptedImage";

const MAX_PHOTOS = 2;

interface PendingUpload {
  key: string;
  previewUrl: string;
}

interface DayPhotosProps {
  day: DayKey;
  photos: JournalPhoto[];
  editing: boolean;
  onPhotoAdded: (photo: JournalPhoto) => void;
  onPhotoRemoved: (photoId: string) => void;
  onPhotoClick?: (index: number) => void;
}

export default function DayPhotos({ day, photos, editing, onPhotoAdded, onPhotoRemoved, onPhotoClick }: DayPhotosProps) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [removing, setRemoving] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef(day);
  dayRef.current = day;

  const canAddMore = photos.length + pending.length < MAX_PHOTOS;

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    const room = Math.max(MAX_PHOTOS - (photos.length + pending.length), 0);
    const batch = files.slice(0, room);
    setError(files.length > room ? `A day can hold at most ${MAX_PHOTOS} photos.` : null);
    if (batch.length === 0) return;

    const uploadDay = day;
    const items = batch.map((file) => ({ file, key: crypto.randomUUID(), previewUrl: URL.createObjectURL(file) }));
    setPending((current) => [...current, ...items.map(({ key, previewUrl }) => ({ key, previewUrl }))]);

    // One at a time: each photo is decoded, resized and encrypted in memory, so a big batch in
    // parallel would spike memory on a phone.
    for (const item of items) {
      try {
        const photo = await uploadJournalPhoto(uploadDay, item.file);
        if (dayRef.current === uploadDay) onPhotoAdded(photo);
      } catch (caught) {
        setError(caught instanceof PhotoError ? caught.message : "Couldn't upload one of the photos. Try again.");
      } finally {
        URL.revokeObjectURL(item.previewUrl);
        setPending((current) => current.filter((entry) => entry.key !== item.key));
      }
    }
  }

  async function handleDelete(photo: JournalPhoto) {
    setError(null);
    setRemoving((current) => [...current, photo.id]);
    try {
      await deleteJournalPhoto(day, photo.id);
      onPhotoRemoved(photo.id);
    } catch {
      setError("Couldn't remove that photo. Try again.");
    } finally {
      setRemoving((current) => current.filter((id) => id !== photo.id));
    }
  }

  if (!editing && photos.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo, index) => (
          <figure
            key={photo.id}
            className={
              "group relative aspect-[4/3] overflow-hidden rounded-card border border-border bg-surface" +
              (!editing ? " cursor-zoom-in" : "") +
              (removing.includes(photo.id) ? " opacity-50" : "")
            }
            onClick={!editing ? () => onPhotoClick?.(index) : undefined}
            role={!editing ? "button" : undefined}
            tabIndex={!editing ? 0 : undefined}
            onKeyDown={
              !editing
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPhotoClick?.(index);
                    }
                  }
                : undefined
            }
          >
            <EncryptedImage
              kind="photo-thumb"
              recordId={photo.id}
              url={photo.thumbUrl}
              alt={photo.caption}
              className="h-full w-full object-cover"
            />
            {editing && (
              <button
                type="button"
                disabled={removing.includes(photo.id)}
                onClick={() => void handleDelete(photo)}
                aria-label="Remove photo"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-100 backdrop-blur-sm transition-opacity duration-150 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </figure>
        ))}

        {pending.map((item) => (
          <div key={item.key} className="relative aspect-[4/3] overflow-hidden rounded-card border border-border bg-surface">
            <img src={item.previewUrl} alt="" className="h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Loader2 size={20} className="animate-spin text-white" strokeWidth={2} />
            </div>
          </div>
        ))}

        {editing && canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              void handleFiles(event.dataTransfer.files);
            }}
            className={
              "flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-card border border-dashed text-secondary transition-colors duration-150 " +
              (dragOver ? "border-text bg-hover text-text" : "border-tertiary/50 hover:bg-hover hover:text-text")
            }
          >
            <ImagePlus size={22} strokeWidth={1.5} />
            <span className="text-[13px]">Add photo</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {editing && !canAddMore && pending.length === 0 && !error && (
        <p className="mt-2 text-[13px] text-tertiary">This day has its {MAX_PHOTOS} photos. Remove one to add another.</p>
      )}

      {error && <p className="mt-2 text-[13px] text-alert">{error}</p>}
    </section>
  );
}