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
      <div className="quiz">
        <p className="quiz-question">{question}</p>
        {options.map((option) => {
          const isSelected = option.key === answer;
          const isCorrect = option.key === correctKey;
          const stateClass = isSelected
            ? (isCorrect ? 'quiz-option--correct' : 'quiz-option--wrong')
            : 'quiz-option--unchosen';
          return (
            <div key={option.key} className={`quiz-option ${stateClass}`}>
              <span className="quiz-option-key">{option.key})</span> {option.label}
              {isSelected && <p className="quiz-feedback">{option.feedback}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="quiz">
      <p className="quiz-question">{question}</p>
      {options.map((option) => (
        <button
          key={option.key}
          className="quiz-btn"
          onClick={() => onAnswer?.({ key: option.key })}
        >
          <span className="quiz-option-key">{option.key})</span> {option.label}
        </button>
      ))}
    </div>
  );
}
