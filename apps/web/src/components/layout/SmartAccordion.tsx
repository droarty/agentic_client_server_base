import { useState, ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

interface Props {
  items?: Record<string, unknown>[];
  idField?: string;
  triggerFields?: string[];
  selectedId?: string | null;
  onSelect?: (payload: { id: string | null }) => void;
  children?: ReactNode;
  [key: string]: unknown;
}

function getField(item: Record<string, unknown>, field: string): string {
  const val = item[field];
  if (val == null) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    return new Date(val).toLocaleString();
  }
  return String(val);
}

export function SmartAccordion({
  items = [],
  idField = 'id',
  triggerFields = [],
  selectedId,
  onSelect,
  children,
}: Props) {
  const [openValue, setOpenValue] = useState<string>('');

  const handleValueChange = (value: string) => {
    setOpenValue(value);
    onSelect?.({ id: value || null });
  };

  if (items.length === 0) {
    return <p className="text-muted-foreground text-xs">No entries found.</p>;
  }

  return (
    <Accordion
      type="single"
      collapsible
      value={openValue}
      onValueChange={handleValueChange}
      className="w-full"
    >
      {items.map((item) => {
        const id = String(item[idField] ?? '');
        const triggerText = triggerFields.map((f) => getField(item, f)).filter(Boolean).join(' · ');
        const isSelected = selectedId === id && openValue === id;

        return (
          <AccordionItem key={id} value={id}>
            <AccordionTrigger>{triggerText || id}</AccordionTrigger>
            <AccordionContent>
              {isSelected
                ? children
                : <p className="text-muted-foreground text-xs">Loading…</p>}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
