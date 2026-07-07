import { MockEntry } from '../index';
import { ProgressBar } from '@/components/layout/ProgressBar';

const stepLabels = ['Step 1', 'Step 2', 'Step 3', 'Step 4'];

export const progressBarMocks: MockEntry[] = [
  {
    id: 'progress-bar-steps-start',
    label: 'Steps — first step active',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400 }}>
        <ProgressBar labels={stepLabels} completionState={0} />
      </div>
    ),
  },
  {
    id: 'progress-bar-steps-middle',
    label: 'Steps — midway',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400 }}>
        <ProgressBar labels={stepLabels} completionState={2} />
      </div>
    ),
  },
  {
    id: 'progress-bar-steps-done',
    label: 'Steps — all complete',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400 }}>
        <ProgressBar labels={stepLabels} completionState={4} />
      </div>
    ),
  },
  {
    id: 'progress-bar-percent-low',
    label: 'Percent — 15%',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400 }}>
        <ProgressBar percentComplete={15} />
      </div>
    ),
  },
  {
    id: 'progress-bar-percent-mid',
    label: 'Percent — 60%',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400 }}>
        <ProgressBar percentComplete={60} />
      </div>
    ),
  },
  {
    id: 'progress-bar-percent-full',
    label: 'Percent — 100%',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400 }}>
        <ProgressBar percentComplete={100} />
      </div>
    ),
  },
  {
    id: 'progress-bar-empty',
    label: 'No props (empty state)',
    group: 'ProgressBar',
    render: () => (
      <div style={{ padding: 24, width: 400, height: 60 }}>
        <ProgressBar />
      </div>
    ),
  },
];
