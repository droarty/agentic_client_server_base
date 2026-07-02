import { MockEntry } from '../index';
import { TextDisplay } from '@/components/layout/TextDisplay';

export const textDisplayMocks: MockEntry[] = [
  {
    id: 'text-display-empty',
    label: 'Empty (placeholder)',
    group: 'TextDisplay',
    render: () => (
      <div style={{ height: 120 }}>
        <TextDisplay />
      </div>
    ),
  },
  {
    id: 'text-display-short',
    label: 'Short text',
    group: 'TextDisplay',
    render: () => (
      <div style={{ height: 120 }}>
        <TextDisplay text="Hello, world! This is a text display component." />
      </div>
    ),
  },
  {
    id: 'text-display-long',
    label: 'Long paragraph',
    group: 'TextDisplay',
    render: () => (
      <div style={{ height: 200 }}>
        <TextDisplay text="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\nDuis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur." />
      </div>
    ),
  },
];
