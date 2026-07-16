import { useRef, useState } from 'react'

export function VisualImageControl({ value, disabled, onUpload, onUrlChange }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const uploadEnabled = typeof onUpload === 'function' && !disabled

  async function choose(file) {
    if (!file || !uploadEnabled) return
    await onUpload(file)
  }

  return (
    <div className="visualImageControl">
      <button
        type="button"
        className={`visualImageDrop ${dragging ? 'dragging' : ''}`}
        disabled={!uploadEnabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={event => { event.preventDefault(); if (uploadEnabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          choose(event.dataTransfer.files?.[0])
        }}
      >
        {value
          ? <img src={value} alt="Selected website asset" />
          : <span>{uploadEnabled ? 'Drop an image here or click to upload' : 'Enter an image URL below'}</span>}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => choose(event.target.files?.[0])} />
      <label>
        Image URL
        <input value={value || ''} disabled={disabled} onChange={event => onUrlChange?.(event.target.value)} placeholder="https://…" />
      </label>
    </div>
  )
}
