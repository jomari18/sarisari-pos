import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { cameraProblem, startScanner, type Scanner, type ScannerEngine } from "./scanner";

/** The camera view (spec 10): on while the dialog is open, off the moment it closes; one code per opening. */
export function ScannerDialog({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [engine, setEngine] = useState<ScannerEngine | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const found = useEffectEvent(onCode);

  useEffect(() => {
    let scanner: Scanner | null = null;
    let closed = false;
    let read = false;
    startScanner(video.current!, (code) => {
      if (read || closed) return;
      read = true;
      found(code);
    })
      .then((started) => {
        // Closed while the camera was starting: turn it straight off again.
        if (closed) started.stop();
        else {
          scanner = started;
          setEngine(started.engine);
        }
      })
      .catch((err: unknown) => {
        if (!closed) setProblem(cameraProblem(err));
      });
    return () => {
      closed = true;
      scanner?.stop();
    };
  }, []);

  return (
    <Dialog title="Scan a barcode" onClose={onClose}>
      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-card bg-black" data-engine={engine ?? undefined}>
        <video ref={video} muted playsInline className="size-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-danger/80" />
      </div>
      {problem ? (
        <p role="alert" className="mt-4 text-danger">
          {problem}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">Point the camera at the barcode. The product is added as soon as it is read.</p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="min-h-12 rounded-control bg-raised px-6 font-medium">
          Close
        </button>
      </div>
    </Dialog>
  );
}
