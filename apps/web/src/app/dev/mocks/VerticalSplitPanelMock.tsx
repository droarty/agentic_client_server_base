import { MockEntry } from '../index';
import { VerticalSplitPanel } from '@/components/layout/VerticalSplitPanel';

function LongList({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ padding: '0.75rem 1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem' }}>{label}</h4>
      {Array.from({ length: count }, (_, i) => (
        <p key={i} style={{ margin: '0.25rem 0' }}>
          {label} item {i + 1}
        </p>
      ))}
    </div>
  );
}

export const verticalSplitPanelMocks: MockEntry[] = [
  {
    id: 'vertical-split-panel-default',
    label: 'Default 40/60 split',
    group: 'VerticalSplitPanel',
    render: () => (
      <div style={{ padding: 24, width: 480, height: 420, border: '1px solid #ddd' }}>
        <VerticalSplitPanel
          top={<LongList label="Top pane" count={20} />}
          bottom={<LongList label="Bottom pane" count={20} />}
        />
      </div>
    ),
  },
  {
    id: 'vertical-split-panel-custom-ratio',
    label: 'Custom initial ratio (70/30)',
    group: 'VerticalSplitPanel',
    render: () => (
      <div style={{ padding: 24, width: 480, height: 420, border: '1px solid #ddd' }}>
        <VerticalSplitPanel
          initialTopPercent={70}
          top={<LongList label="Top pane" count={20} />}
          bottom={<LongList label="Bottom pane" count={20} />}
        />
      </div>
    ),
  },
  {
    id: 'vertical-split-panel-short-content',
    label: 'Short content (no scroll needed)',
    group: 'VerticalSplitPanel',
    render: () => (
      <div style={{ padding: 24, width: 480, height: 420, border: '1px solid #ddd' }}>
        <VerticalSplitPanel
          top={<LongList label="Top pane" count={2} />}
          bottom={<LongList label="Bottom pane" count={2} />}
        />
      </div>
    ),
  },
];
