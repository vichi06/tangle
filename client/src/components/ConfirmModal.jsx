import { useState, useCallback } from 'react';
import './ConfirmModal.css';

function ConfirmModal({ message, onConfirm, onCancel }) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onCancel, 200);
  }, [onCancel]);

  return (
    <div className={`confirm-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`confirm-modal ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={handleClose}>
            Cancel
          </button>
          <button className="confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
