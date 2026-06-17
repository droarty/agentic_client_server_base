interface QuizOption {
  key: string;
  label: string;
  feedback: string;
}

interface Props {
  question?: string;
  options?: QuizOption[];
  correctKey?: string;
  answer?: string;
  onAnswer?: (payload: Record<string, unknown>) => void;
}

export function MultipleChoiceQuiz({ question = '', options = [], correctKey, answer, onAnswer }: Props) {
  if (answer) {
    return (
      <div className="border-t border-border p-3 flex flex-col gap-2">
        <p className="text-sm font-medium">{question}</p>
        {options.map((option) => {
          const isSelected = option.key === answer;
          const isCorrect = option.key === correctKey;
          let className = 'px-3 py-2 rounded text-sm';
          if (isSelected) {
            className += isCorrect
              ? ' bg-green-100 text-green-800 border border-green-300'
              : ' bg-red-100 text-red-800 border border-red-300';
          } else {
            className += ' text-muted-foreground opacity-50';
          }
          return (
            <div key={option.key} className={className}>
              <span className="font-medium">{option.key})</span> {option.label}
              {isSelected && (
                <p className="mt-1 text-xs italic">{option.feedback}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3 flex flex-col gap-2">
      <p className="text-sm font-medium">{question}</p>
      {options.map((option) => (
        <button
          key={option.key}
          className="text-left px-3 py-2 rounded border border-border text-sm hover:bg-muted transition-colors"
          onClick={() => onAnswer?.({ key: option.key })}
        >
          <span className="font-medium">{option.key})</span> {option.label}
        </button>
      ))}
    </div>
  );
}
