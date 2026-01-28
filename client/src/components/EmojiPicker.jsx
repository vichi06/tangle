import { useRef, useEffect } from 'react';
import './EmojiPicker.css';

const EMOJI_LIST = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '💯', '🎉'];

function EmojiPicker({ onSelect, onClose, position = 'top' }) {
  const pickerRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className={`emoji-picker ${position}`} ref={pickerRef}>
      {EMOJI_LIST.map((emoji) => (
        <button
          key={emoji}
          className="emoji-picker-item"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          type="button"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export default EmojiPicker;
