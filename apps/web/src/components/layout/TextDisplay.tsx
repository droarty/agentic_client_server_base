interface Props {
  text?: string;
  placeholder?: string;
}

export function TextDisplay({ text, placeholder = 'Nothing to display yet.' }: Props) {
  if (typeof text !== 'string' && text !== undefined) {
    console.warn('TextDisplay: expected string text, got', text);
  }
  if (typeof text !== 'string' || !text) {
    return <div className="text-display--empty">{placeholder}</div>;
  }
  return <div className="text-display">{text}</div>;
}
