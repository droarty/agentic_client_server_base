interface Props {
  labels?: string[];
  completionState?: number;
  percentComplete?: number;
  [key: string]: unknown;
}

export function ProgressBar({ labels, completionState = 0, percentComplete }: Props) {
  if (labels && labels.length > 0) {
    return (
      <div className="progress-bar progress-bar--steps">
        <div className="progress-bar-steps">
          {labels.map((label, i) => {
            const status = i < completionState ? 'completed' : i === completionState ? 'active' : 'pending';
            return (
              <div key={label} className={`progress-bar-step progress-bar-step--${status}`}>
                <div className="progress-bar-step-marker">
                  <span className="progress-bar-step-dot" />
                  {i < labels.length - 1 && (
                    <span className={`progress-bar-step-connector${i < completionState ? ' progress-bar-step-connector--filled' : ''}`} />
                  )}
                </div>
                <span className="progress-bar-step-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (typeof percentComplete === 'number') {
    const pct = Math.min(100, Math.max(0, percentComplete));
    return (
      <div className="progress-bar progress-bar--percent">
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="progress-bar-percent-label">{Math.round(pct)}%</span>
      </div>
    );
  }

  return null;
}
