"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import styles from "./programme-rundown-gallery.module.css";

type RundownImage = Readonly<{
  id: string;
  url: string;
}>;

export function ProgrammeRundownGallery({ images }: { images: readonly RundownImage[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const current = images[page];
  if (!current) return null;

  return (
    <>
      <button
        className="button button-secondary"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        View programme rundown
      </button>
      <dialog
        aria-label="Programme rundown"
        className={styles.dialog}
        onClose={() => setPage(0)}
        ref={dialogRef}
      >
        <div className={styles.header}>
          <div>
            <strong>Programme rundown</strong>
            <span>Page {page + 1} of {images.length}</span>
          </div>
          <button
            aria-label="Close programme rundown"
            className="button button-secondary"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            Close
          </button>
        </div>
        <div className={styles.imageFrame}>
          <Image
            alt={`Programme rundown page ${page + 1}`}
            fill
            priority={page === 0}
            sizes="(max-width: 900px) 94vw, 900px"
            src={current.url}
          />
        </div>
        {images.length > 1 ? (
          <div className={styles.controls}>
            <button
              className="button button-secondary"
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="button button-secondary"
              disabled={page === images.length - 1}
              onClick={() => setPage((value) => Math.min(images.length - 1, value + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
