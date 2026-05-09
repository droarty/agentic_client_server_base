import { Suspense, ReactNode } from 'react';
import { LayoutNode } from '@multiplayer-base/shared-types';
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
    result[key] = resolveDotPath(state, value.startsWith('$') ? value.slice(1) : value);
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

function buildChildren(
  node: LayoutNode,
  state: Record<string, unknown>,
  emit: Props['emit']
): ReactNode[] {
  if (!node.children) return [];
  const result: ReactNode[] = [];
  node.children.forEach((child, i) => {
    if (child.componentType === 'forEach') {
      const sourcePath = (child.props?.source ?? '').replace(/^\$/, '');
      const items = (resolveDotPath(state, sourcePath) as Record<string, unknown>[]) ?? [];
      items.forEach((item, j) => {
        const itemState = { ...state, item };
        (child.children ?? []).forEach((template, k) => {
          result.push(
            <Suspense key={`${i}-${j}-${k}`} fallback={null}>
              {renderNode(template, itemState, emit)}
            </Suspense>
          );
        });
      });
    } else {
      result.push(
        <Suspense key={i} fallback={null}>
          {renderNode(child, state, emit)}
        </Suspense>
      );
    }
  });
  return result;
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
  const children = buildChildren(node, state, emit);

  return (
    <Component
      {...resolvedProps}
      {...resolvedEmits}
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
