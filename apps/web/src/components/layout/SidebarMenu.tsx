import { useState, ReactNode } from 'react';

interface SidebarMenuItem {
  type?: 'separator';
  name?: string;
  icon?: string;
  _id?: string;
  emits_msg?: string;
  children?: SidebarMenuItem[];
  classes?: string;
  collapsible?: boolean;
}

interface Props {
  items?: SidebarMenuItem[];
  emit?: (type: string, payload: Record<string, unknown>) => void;
  onSelect?: (payload: Record<string, unknown>) => void;
  [key: string]: unknown;
}

function itemKey(item: SidebarMenuItem): string {
  return item._id ?? item.name ?? '';
}

export function SidebarMenu({ items = [], emit, onSelect }: Props) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  function handleClick(item: SidebarMenuItem) {
    const key = itemKey(item);

    if (item.collapsible && item.children?.length) {
      setOpenKeys((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    }

    if (item.emits_msg) {
      emit?.(item.emits_msg, { _id: item._id, name: item.name });
    } else {
      onSelect?.({ _id: item._id, name: item.name });
    }
  }

  function renderItems(list: SidebarMenuItem[]): ReactNode {
    return list.map((item, i) => {
      if (item.type === 'separator') {
        return <hr key={i} className="smenu-separator" />;
      }

      const key = itemKey(item);
      const hasChildren = !!item.children?.length;
      const isCollapsible = item.collapsible && hasChildren;
      const isOpen = !isCollapsible || openKeys.has(key);

      const itemClasses = [
        'smenu-item',
        isCollapsible ? 'smenu-item--collapsible' : '',
        isCollapsible && openKeys.has(key) ? 'smenu-item--open' : '',
        item.classes ?? '',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <div key={key || i} className={itemClasses}>
          <button className="smenu-link" onClick={() => handleClick(item)}>
            {item.icon && <span className="smenu-icon">{item.icon}</span>}
            <span className="smenu-label">{item.name}</span>
            {isCollapsible && <span className="smenu-arrow">▶</span>}
          </button>
          {hasChildren && (
            <div className={`smenu-children${isOpen ? ' smenu-children--open' : ''}`}>
              {renderItems(item.children!)}
            </div>
          )}
        </div>
      );
    });
  }

  return <nav className="smenu">{renderItems(items)}</nav>;
}
