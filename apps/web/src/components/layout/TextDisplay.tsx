interface Props {
  text?: string;
  placeholder?: string;
}

export function TextDisplay({ text, placeholder = 'Nothing to display yet.' }: Props) {
  if (!text) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-muted-foreground text-sm italic">
        {placeholder}
      </div>
    );
  }
  return (
    <div className="p-6 text-sm leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
      {text}
    </div>
  );
}
