interface Props {
  text?: string;
  placeholder?: string;
}

export function TextDisplay({ text, placeholder = 'Nothing to display yet.' }: Props) {
  if (!text) {
    return <div className="text-display--empty">{placeholder}</div>;
  }
  return <div className="text-display">{text}</div>;
}
