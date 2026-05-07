import { Suspense, ReactNode } from 'react';
import { LayoutNode, ChildTemplate } from '@multiplayer-base/shared-types';
import { getLayoutComponent } from '@/app/registry/layoutRegistry';

interface Props {
  nodes: LayoutNode[];
  state: Record<string, unknown>;
  emit: (type: string, payload: Record<string, unknown>) => void;
}

function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function resolveProps(
  props: Record<string, string> | undefined,
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveDotPath(state, value);
  }
  return result;
}

function resolveEmits(
  emits: Record<string, string> | undefined,
  emit: Props['emit']
): Record<string, (payload: Record<string, unknown>) => void> {
  if (!emits) return {};
  const result: Record<string, (payload: Record<string, unknown>) => void> = {};
  for (const [eventName, messageType] of Object.entries(emits)) {
    const propName = 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
    result[propName] = (payload: Record<string, unknown>) => emit(messageType, payload);
  }
  return result;
}

function resolveChildTemplate(
  childTemplate: ChildTemplate,
  state: Record<string, unknown>,
  emit: Props['emit']
): { dynamicChildren: ReactNode[]; dynamicTabIds: string[]; dynamicTabTitles: string[] } {
  const { source, idField, titleField, template } = childTemplate;
  const items = (resolveDotPath(state, source) as Record<string, unknown>[]) ?? [];
  return {
    dynamicChildren: items.map((item, i) => (
      <Suspense key={String(item[idField] ?? i)} fallback={null}>
        {renderNode(template, { ...state, item }, emit)}
      </Suspense>
    )),
    dynamicTabIds:    items.map((item) => String(item[idField]    ?? '')),
    dynamicTabTitles: items.map((item) => String(item[titleField] ?? '')),
  };
}

function renderNode(
  node: LayoutNode,
  state: Record<string, unknown>,
  emit: Props['emit']
): ReactNode {
  const Component = getLayoutComponent(node.componentType);
  if (!Component) {
    console.warn(`LayoutRenderer: unknown componentType "${node.componentType}"`);
    return null;
  }

  const resolvedProps = resolveProps(node.props, state);
  const resolvedEmits = resolveEmits(node.emits, emit);

  const children = node.children?.map((child, i) => (
    <Suspense key={i} fallback={null}>
      {renderNode(child, state, emit)}
    </Suspense>
  ));

  const templateProps = node.childTemplate
    ? resolveChildTemplate(node.childTemplate, state, emit)
    : {};

  return (
    <Component
      {...resolvedProps}
      {...resolvedEmits}
      {...templateProps}
      targetId={node.targetId}
    >
      {children}
    </Component>
  );
}

export function LayoutRenderer({ nodes, state, emit }: Props) {
  return (
    <>
      {nodes.map((node, i) => (
        <Suspense key={i} fallback={<p className="doc-empty">Loading…</p>}>
          {renderNode(node, state, emit)}
        </Suspense>
      ))}
    </>
  );
}
