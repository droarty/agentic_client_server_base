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
  inputs?: Record<string, string>;
  onSubmit?: (payload: Record<string, string>) => void;
}

export function MultiFieldInput({ fields = [], submitLabel = 'Submit', values = {}, inputs, onSubmit }: Props) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, inputs?.[f.name] ?? values[f.name] ?? '']))
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

  if (inputs) {
    return (
      <div className="multi-input">
        {fields.map((field) => (
          <div key={field.name} className="multi-input-field">
            <span className="multi-input-label">{field.label}</span>
            <span className="multi-input-value">{inputs[field.name]}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="multi-input">
      {fields.map((field) => (
        <div key={field.name} className="multi-input-field">
          <label className="multi-input-label">{field.label}</label>
          <input
            className="multi-input-control"
            type="text"
            value={fieldValues[field.name] ?? ''}
            placeholder={field.placeholder}
            onChange={(e) => handleChange(field.name, e.target.value)}
          />
        </div>
      ))}
      <div className="multi-input-submit">
        <Button
          onClick={handleSubmit}
          disabled={!fields.every((f) => fieldValues[f.name]?.trim())}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
