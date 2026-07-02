import { MockEntry } from '../index';
import { SmartAccordion } from '@/components/layout/SmartAccordion';

const LOG_ITEMS = [
  { id: 'log-1', name: 'Build pipeline triggered', date: '2025-06-28T09:12:00Z', status: 'success' },
  { id: 'log-2', name: 'Unit tests ran', date: '2025-06-28T09:14:22Z', status: 'success' },
  { id: 'log-3', name: 'Deploy to staging failed', date: '2025-06-28T09:17:05Z', status: 'error' },
  { id: 'log-4', name: 'Manual rollback initiated', date: '2025-06-28T09:21:33Z', status: 'warning' },
];

export const smartAccordionMocks: MockEntry[] = [
  {
    id: 'smart-accordion-basic',
    label: 'Log entries',
    group: 'SmartAccordion',
    render: () => (
      <div className="p-4" style={{ width: 480 }}>
        <SmartAccordion
          items={LOG_ITEMS}
          idField="id"
          triggerFields={['name', 'date']}
          onSelect={(p) => console.log('SmartAccordion selected:', p)}
        >
          <div className="p-3 space-y-2 text-sm">
            <p className="text-muted-foreground">Status: <span className="text-foreground font-medium">Completed</span></p>
            <p className="text-muted-foreground">Duration: <span className="text-foreground font-medium">2m 34s</span></p>
            <p className="text-muted-foreground">Output: <span className="text-foreground font-medium">12 records processed</span></p>
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
      <div className="p-4" style={{ width: 480 }}>
        <SmartAccordion items={[]} idField="id" triggerFields={['name']} />
      </div>
    ),
  },
];
