import { useLanguage } from '../i18n/LanguageContext';
import './ConfirmModal.css';

function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useLanguage();

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button className="confirm-delete" onClick={onConfirm}>
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
