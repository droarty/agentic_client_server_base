import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { LogTreePanel } from './LogTreePanel';

interface Props {
  items?: Record<string, unknown>[];
  idField?: string;
  triggerFields?: string[];
  selectedId?: string | null;
  contentItems?: Record<string, unknown>[];
  contentFields?: string[];
  contentMode?: string;
  contentIdField?: string;
  contentTriggerFields?: string[];
  selectedContentId?: string | null;
  contentPanelData?: unknown;
  onSelect?: (payload: { id: string | null }) => void;
  onSelectContent?: (payload: { id: string | null }) => void;
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

function NestedAccordionContent({
  contentItems,
  contentIdField,
  contentTriggerFields,
  selectedContentId,
  contentPanelData,
  onSelectContent,
}: {
  contentItems: Record<string, unknown>[];
  contentIdField: string;
  contentTriggerFields: string[];
  selectedContentId: string | null | undefined;
  contentPanelData: unknown;
  onSelectContent?: (payload: { id: string | null }) => void;
}) {
  const [nestedOpenValue, setNestedOpenValue] = useState<string>('');

  const handleNestedValueChange = (value: string) => {
    setNestedOpenValue(value);
    onSelectContent?.({ id: value || null });
  };

  if (contentItems.length === 0) {
    return <p className="text-muted-foreground text-xs">No entries found.</p>;
  }

  return (
    <Accordion
      type="single"
      collapsible
      value={nestedOpenValue}
      onValueChange={handleNestedValueChange}
      className="w-full"
    >
      {contentItems.map((item) => {
        const nestedId = String(item[contentIdField] ?? '');
        const triggerText = contentTriggerFields.map((f) => getField(item, f)).filter(Boolean).join(' · ');
        const isContentSelected = selectedContentId === nestedId && nestedOpenValue === nestedId;

        return (
          <AccordionItem key={nestedId} value={nestedId}>
            <AccordionTrigger>{triggerText || nestedId}</AccordionTrigger>
            <AccordionContent>
              {isContentSelected ? (
                <div className="min-h-[200px]">
                  <LogTreePanel treeData={contentPanelData} />
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">Loading…</p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

export function SmartAccordion({
  items = [],
  idField = 'id',
  triggerFields = [],
  selectedId,
  contentItems = [],
  contentFields = [],
  contentMode,
  contentIdField = '_id',
  contentTriggerFields = [],
  selectedContentId,
  contentPanelData,
  onSelect,
  onSelectContent,
}: Props) {
  const [openValue, setOpenValue] = useState<string>('');

  const handleValueChange = (value: string) => {
    setOpenValue(value);
    onSelect?.({ id: value || null });
  };

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
              {isSelected ? (
                contentMode === 'nested-accordion' ? (
                  <NestedAccordionContent
                    contentItems={contentItems}
                    contentIdField={contentIdField}
                    contentTriggerFields={contentTriggerFields}
                    selectedContentId={selectedContentId}
                    contentPanelData={contentPanelData}
                    onSelectContent={onSelectContent}
                  />
                ) : contentItems.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No entries found.</p>
                ) : (
                  <ul className="space-y-1">
                    {contentItems.map((row, i) => (
                      <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-3 py-1">
                        {contentFields.map((f) => getField(row, f)).filter(Boolean).join(' · ')}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="text-muted-foreground text-xs">Loading…</p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
