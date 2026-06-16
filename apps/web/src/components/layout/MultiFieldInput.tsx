import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface FieldDef {
  name: string;
  label: string;
  placeholder?: string;
}

interface Props {
  fields?: FieldDef[];
  submitLabel?: string;
  values?: Record<string, string>;
  onSubmit?: (payload: Record<string, string>) => void;
}

export function MultiFieldInput({ fields = [], submitLabel = 'Submit', values = {}, onSubmit }: Props) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? '']))
  );

  function handleChange(name: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit() {
    const allFilled = fields.every((f) => fieldValues[f.name]?.trim());
    if (!allFilled) return;
    const text = fields.map((f) => `${f.label}: ${fieldValues[f.name]}`).join(', ');
    onSubmit?.({ ...fieldValues, text });
  }

  return (
    <div className="border-t border-border p-3 flex flex-col gap-2">
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <input
            className="border border-border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            type="text"
            value={fieldValues[field.name] ?? ''}
            placeholder={field.placeholder}
            onChange={(e) => handleChange(field.name, e.target.value)}
          />
        </div>
      ))}
      <Button
        className="mt-1 self-end"
        onClick={handleSubmit}
        disabled={!fields.every((f) => fieldValues[f.name]?.trim())}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
