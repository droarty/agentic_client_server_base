import { CSSProperties } from 'react';
import { MockEntry } from '../index';
import { SmartAccordion } from '@/components/layout/SmartAccordion';

const LOG_ITEMS = [
  { id: 'log-1', name: 'Build pipeline triggered', date: '2025-06-28T09:12:00Z', status: 'success' },
  { id: 'log-2', name: 'Unit tests ran', date: '2025-06-28T09:14:22Z', status: 'success' },
  { id: 'log-3', name: 'Deploy to staging failed', date: '2025-06-28T09:17:05Z', status: 'error' },
  { id: 'log-4', name: 'Manual rollback initiated', date: '2025-06-28T09:21:33Z', status: 'warning' },
];

const detailStyle: CSSProperties = {
  padding: '0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  fontSize: '0.875rem',
};
const mutedStyle: CSSProperties = { color: 'hsl(var(--muted-foreground))' };
const emphStyle: CSSProperties = { color: 'hsl(var(--foreground))', fontWeight: 500 };

export const smartAccordionMocks: MockEntry[] = [
  {
    id: 'smart-accordion-basic',
    label: 'Log entries',
    group: 'SmartAccordion',
    render: () => (
      <div style={{ padding: '1rem', width: 480 }}>
        <SmartAccordion
          items={LOG_ITEMS}
          idField="id"
          triggerFields={['name', 'date']}
          onSelect={(p) => console.log('SmartAccordion selected:', p)}
        >
          <div style={detailStyle}>
            <p style={mutedStyle}>Status: <span style={emphStyle}>Completed</span></p>
            <p style={mutedStyle}>Duration: <span style={emphStyle}>2m 34s</span></p>
            <p style={mutedStyle}>Output: <span style={emphStyle}>12 records processed</span></p>
          </div>
        </SmartAccordion>
      </div>
    ),
  },
  {
    id: 'smart-accordion-empty',
    label: 'Empty state',
    group: 'SmartAccordion',
    render: () => (
      <div style={{ padding: '1rem', width: 480 }}>
        <SmartAccordion items={[]} idField="id" triggerFields={['name']} />
      </div>
    ),
  },
];
