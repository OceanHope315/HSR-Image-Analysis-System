import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ open, title, description, confirmLabel = '确认', danger = false, busy = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={`modal-symbol${danger ? ' modal-symbol--danger' : ''}`}>{danger ? '!' : '?'}</div>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="button button--secondary" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className={`button${danger ? ' button--danger' : ''}`} disabled={busy} onClick={onConfirm}>
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
