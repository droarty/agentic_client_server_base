import { MockEntry } from '../index';
import { SidebarMenu } from '@/components/layout/SidebarMenu';

export const sidebarMenuMocks: MockEntry[] = [
  {
    id: 'sidebar-menu-basic',
    label: 'Basic flat list',
    group: 'SidebarMenu',
    render: () => (
      <div style={{ width: 260, height: 360 }}>
        <SidebarMenu
          items={[
            { name: 'Dashboard', icon: '📊', _id: 'dashboard' },
            { name: 'Documents', icon: '📄', _id: 'docs' },
            { name: 'Messages', icon: '💬', _id: 'messages' },
            { type: 'separator' },
            { name: 'Settings', icon: '⚙️', _id: 'settings' },
            { name: 'Help', icon: '❓', _id: 'help' },
          ]}
          onSelect={(p) => console.log('SidebarMenu selected:', p)}
        />
      </div>
    ),
  },
  {
    id: 'sidebar-menu-collapsible',
    label: 'Collapsible groups',
    group: 'SidebarMenu',
    render: () => (
      <div style={{ width: 260, height: 480 }}>
        <SidebarMenu
          items={[
            { name: 'Home', icon: '🏠', _id: 'home' },
            { type: 'separator' },
            {
              name: 'Projects',
              icon: '📁',
              _id: 'projects',
              collapsed: true,
              children: [
                { name: 'Alpha', _id: 'project-alpha' },
                { name: 'Beta', _id: 'project-beta' },
                { name: 'Gamma', _id: 'project-gamma' },
              ],
            },
            {
              name: 'Settings',
              icon: '⚙️',
              _id: 'settings',
              collapsed: true,
              children: [
                { name: 'Profile', _id: 'settings-profile' },
                { name: 'Security', _id: 'settings-security' },
                { name: 'Billing', _id: 'settings-billing' },
              ],
            },
            { type: 'separator' },
            { name: 'Sign out', icon: '🚪', _id: 'signout' },
          ]}
          onSelect={(p) => console.log('SidebarMenu selected:', p)}
        />
      </div>
    ),
  },
  {
    id: 'sidebar-menu-nested',
    label: 'Always-visible children',
    group: 'SidebarMenu',
    render: () => (
      <div style={{ width: 260, height: 400 }}>
        <SidebarMenu
          items={[
            {
              name: 'Channels',
              icon: '#',
              _id: 'channels',
              children: [
                { name: 'general', _id: 'ch-general' },
                { name: 'engineering', _id: 'ch-engineering' },
                { name: 'design', _id: 'ch-design' },
              ],
            },
            {
              name: 'Direct Messages',
              icon: '💬',
              _id: 'dms',
              children: [
                { name: 'Alice', _id: 'dm-alice' },
                { name: 'Bob', _id: 'dm-bob' },
              ],
            },
          ]}
          onSelect={(p) => console.log('SidebarMenu selected:', p)}
        />
      </div>
    ),
  },
];
