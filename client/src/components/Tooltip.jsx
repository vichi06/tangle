import { useMemo } from 'react';
import './Tooltip.css';

const INTENSITY_LABELS = {
  kiss: 'Kiss',
  cuddle: 'Cuddle in bed',
  couple: 'Couple',
  hidden: 'Hidden'
};

function Tooltip({ data, position, onClose }) {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const pos = useMemo(() => {
    if (!position || isTouchDevice) return { x: 0, y: 0 };

    const offset = 15;
    let x = position.x + offset;
    let y = position.y + offset;

    const tooltipWidth = 250;
    const tooltipHeight = 150;

    if (x + tooltipWidth > window.innerWidth) {
      x = position.x - tooltipWidth - offset;
    }
    if (y + tooltipHeight > window.innerHeight) {
      y = position.y - tooltipHeight - offset;
    }

    return { x, y };
  }, [position, isTouchDevice]);

  if (!data) return null;

  const content = data.type === 'node' ? (
    <div className="tooltip-node">
      {data.avatar && (
        <img
          src={data.avatar}
          alt={`${data.firstName} ${data.lastName}`}
          className="tooltip-avatar"
        />
      )}
      <div className="tooltip-content">
        <h3 className="tooltip-name">{data.firstName} {data.lastName}</h3>
        {data.bio && (
          <p className="tooltip-bio">{data.bio}</p>
        )}
        <p className="tooltip-connections">
          {data.connections} connections
        </p>
      </div>
    </div>
  ) : (
    <div className="tooltip-link">
      <p className="tooltip-link-people">
        <span>{data.person1}</span>
        <span className="tooltip-heart">&#9829;</span>
        <span>{data.person2}</span>
      </p>
      {data.intensity && (
        <p className="tooltip-intensity">
          {INTENSITY_LABELS[data.intensity] || data.intensity}
        </p>
      )}
      {data.date && (
        <p className="tooltip-date">{data.date}</p>
      )}
      {data.context && (
        <p className="tooltip-context">{data.context}</p>
      )}
    </div>
  );

  // Mobile: bottom sheet modal
  if (isTouchDevice) {
    return (
      <div className="tooltip-overlay" onClick={onClose}>
        <div className="tooltip-bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="tooltip-handle" />
          {content}
        </div>
      </div>
    );
  }

  // Desktop: positioned tooltip
  return (
    <div
      className="tooltip"
      style={{
        left: pos.x,
        top: pos.y
      }}
    >
      {content}
    </div>
  );
}

export default Tooltip;
