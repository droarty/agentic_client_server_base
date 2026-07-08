import { ReactNode } from 'react';
import { textDisplayMocks } from './mocks/TextDisplayMock';
import { smartAccordionMocks } from './mocks/SmartAccordionMock';
import { sidebarMenuMocks } from './mocks/SidebarMenuMock';
import { chatBodyMocks } from './mocks/ChatBodyMock';
import { progressBarMocks } from './mocks/ProgressBarMock';
import { verticalSplitPanelMocks } from './mocks/VerticalSplitPanelMock';

export interface MockEntry {
  id: string;
  label: string;
  group: string;
  render: () => ReactNode;
}

export const allMocks: MockEntry[] = [
  ...textDisplayMocks,
  ...smartAccordionMocks,
  ...sidebarMenuMocks,
  ...chatBodyMocks,
  ...progressBarMocks,
  ...verticalSplitPanelMocks,
];
