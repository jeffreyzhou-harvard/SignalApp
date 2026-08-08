import { useEffect, useRef, useState } from 'react'

export function CameraAskModal({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="modal-scrim">
      <div className="modal">
        <div className="modal-glyph">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="2.5" y="6" width="14" height="12" rx="3" />
            <path d="M16.5 10.5l5-3v9l-5-3z" strokeLinejoin="round" />
          </svg>
        </div>
        <h3>Show the product?</h3>
        <p>Grok can look at what you’re holding and write the creative brief from it.</p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onYes}>
            Turn camera on
          </button>
          <button className="btn-ghost" onClick={onNo}>
            Skip — I’ll describe it
          </button>
        </div>
      </div>
    </div>
  )
}

export function CameraPip({ scanned }: { scanned: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640 }, audio: false })
      .then((s) => {
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setErr(true))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  return (
    <div className="camera-pip">
      <div className="pip-frame">
        {err ? (
          <div className="pip-fallback">camera unavailable — using description</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}
        {!scanned && !err && <div className="scanline" />}
        <span className="pip-live">
          <span className="live-dot" /> LIVE
        </span>
      </div>
      {scanned && (
        <div className="vision-chip">
          ✦ Grok vision — detected: <strong>palm-sized robot · OLED face · white shell</strong>
        </div>
      )}
    </div>
  )
}
