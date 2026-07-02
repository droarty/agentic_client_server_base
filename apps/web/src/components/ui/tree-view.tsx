import React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';

export interface TreeDataItem {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  selectedIcon?: React.ComponentType<{ className?: string }>;
  openIcon?: React.ComponentType<{ className?: string }>;
  children?: TreeDataItem[];
  actions?: React.ReactNode;
  onClick?: () => void;
}

type TreeProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
  data: TreeDataItem[] | TreeDataItem;
  initialSelectedItemId?: string;
  onSelectChange?: (item: TreeDataItem | undefined) => void;
  expandAll?: boolean;
  defaultNodeIcon?: React.ComponentType<{ className?: string }>;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
};

function TreeView({ ref, data, initialSelectedItemId, onSelectChange, expandAll, defaultLeafIcon, defaultNodeIcon, className, ...props }: TreeProps) {
  const [selectedItemId, setSelectedItemId] = React.useState<string | undefined>(initialSelectedItemId);

  const handleSelectChange = React.useCallback(
    (item: TreeDataItem | undefined) => {
      setSelectedItemId(item?.id);
      onSelectChange?.(item);
    },
    [onSelectChange]
  );

  const expandedItemIds = React.useMemo(() => {
    if (!initialSelectedItemId) return [] as string[];
    const ids: string[] = [];
    function walkTreeItems(items: TreeDataItem[] | TreeDataItem, targetId: string): boolean {
      if (Array.isArray(items)) {
        for (const item of items) {
          ids.push(item.id);
          if (walkTreeItems(item, targetId) && !expandAll) return true;
          if (!expandAll) ids.pop();
        }
      } else if (!expandAll && items.id === targetId) {
        return true;
      } else if (items.children) {
        return walkTreeItems(items.children, targetId);
      }
      return false;
    }
    walkTreeItems(data, initialSelectedItemId);
    return ids;
  }, [data, expandAll, initialSelectedItemId]);

  return (
    <div className={['tree', className].filter(Boolean).join(' ')}>
      <TreeItem
        data={data}
        ref={ref}
        selectedItemId={selectedItemId}
        handleSelectChange={handleSelectChange}
        expandedItemIds={expandedItemIds}
        defaultLeafIcon={defaultLeafIcon}
        defaultNodeIcon={defaultNodeIcon}
        {...props}
      />
    </div>
  );
}
TreeView.displayName = 'TreeView';

type TreeItemProps = TreeProps & {
  selectedItemId?: string;
  handleSelectChange: (item: TreeDataItem | undefined) => void;
  expandedItemIds: string[];
  defaultNodeIcon?: React.ComponentType<{ className?: string }>;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
};

function TreeItem({ ref, className, data, selectedItemId, handleSelectChange, expandedItemIds, defaultNodeIcon, defaultLeafIcon, ...props }: TreeItemProps) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <div ref={ref} role="tree" className={className} {...props}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.children ? (
              <TreeNode
                item={item}
                selectedItemId={selectedItemId}
                expandedItemIds={expandedItemIds}
                handleSelectChange={handleSelectChange}
                defaultNodeIcon={defaultNodeIcon}
                defaultLeafIcon={defaultLeafIcon}
              />
            ) : (
              <TreeLeaf
                item={item}
                selectedItemId={selectedItemId}
                handleSelectChange={handleSelectChange}
                defaultLeafIcon={defaultLeafIcon}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
TreeItem.displayName = 'TreeItem';

const TreeNode = ({
  item,
  handleSelectChange,
  expandedItemIds,
  selectedItemId,
  defaultNodeIcon,
  defaultLeafIcon,
}: {
  item: TreeDataItem;
  handleSelectChange: (item: TreeDataItem | undefined) => void;
  expandedItemIds: string[];
  selectedItemId?: string;
  defaultNodeIcon?: React.ComponentType<{ className?: string }>;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
}) => {
  const [value, setValue] = React.useState(expandedItemIds.includes(item.id) ? [item.id] : []);
  const isSelected = selectedItemId === item.id;

  return (
    <AccordionPrimitive.Root type="multiple" value={value} onValueChange={setValue}>
      <AccordionPrimitive.Item value={item.id}>
        <TreeAccordionTrigger
          className={['tree-node', isSelected ? 'tree-node--selected' : ''].filter(Boolean).join(' ')}
          onClick={() => { handleSelectChange(item); item.onClick?.(); }}
        >
          <TreeIcon item={item} isSelected={isSelected} isOpen={value.includes(item.id)} default={defaultNodeIcon} />
          <span className="tree-label">{item.name}</span>
        </TreeAccordionTrigger>
        <AccordionPrimitive.Content className="tree-accord-content">
          <div className="tree-children">
            <TreeItem
              data={item.children ?? []}
              selectedItemId={selectedItemId}
              handleSelectChange={handleSelectChange}
              expandedItemIds={expandedItemIds}
              defaultLeafIcon={defaultLeafIcon}
              defaultNodeIcon={defaultNodeIcon}
            />
          </div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
};

function TreeLeaf({ ref, className, item, selectedItemId, handleSelectChange, defaultLeafIcon, ...props }: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
  item: TreeDataItem;
  selectedItemId?: string;
  handleSelectChange: (item: TreeDataItem | undefined) => void;
  defaultLeafIcon?: React.ComponentType<{ className?: string }>;
}) {
  const isSelected = selectedItemId === item.id;
  return (
    <div
      ref={ref}
      className={['tree-leaf', isSelected ? 'tree-leaf--selected' : '', className].filter(Boolean).join(' ')}
      onClick={() => { handleSelectChange(item); item.onClick?.(); }}
      {...props}
    >
      <TreeIcon item={item} isSelected={isSelected} default={defaultLeafIcon} />
      <span className="tree-leaf-name">{item.name}</span>
    </div>
  );
}
TreeLeaf.displayName = 'TreeLeaf';

function TreeAccordionTrigger({ ref, className, children, ...props }: React.ComponentPropsWithRef<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        ref={ref}
        className={['tree-trigger', className].filter(Boolean).join(' ')}
        {...props}
      >
        <ChevronRight className="tree-chevron" />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}
TreeAccordionTrigger.displayName = 'TreeAccordionTrigger';

const TreeIcon = ({
  item,
  isOpen,
  isSelected,
  default: defaultIcon,
}: {
  item: TreeDataItem;
  isOpen?: boolean;
  isSelected?: boolean;
  default?: React.ComponentType<{ className?: string }>;
}) => {
  let Icon: React.ComponentType<{ className?: string }> | undefined = defaultIcon;
  if (isSelected && item.selectedIcon) Icon = item.selectedIcon;
  else if (isOpen && item.openIcon) Icon = item.openIcon;
  else if (item.icon) Icon = item.icon;
  return Icon ? <Icon className="tree-icon" /> : <></>;
};

export { TreeView };
