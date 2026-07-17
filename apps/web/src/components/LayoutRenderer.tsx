import { Suspense, Fragment, ReactNode } from 'react';
import { LayoutNode } from '@agentic-client-server-base/shared-types';
import { getLayoutComponent } from '@/app/registry/layoutRegistry';

interface Props {
  nodes: LayoutNode[];
  state: Record<string, unknown>;
  emit: (type: string, payload: Record<string, unknown>) => void;
  channelId: string;
}

function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function resolveProps(
  props: Record<string, unknown> | undefined,
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] =
      typeof value === 'string' && value.startsWith('@')
        ? resolveDotPath(state, value.slice(1))
        : value;
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
  emit: Props['emit'],
  channelId: string
): ReactNode[] {
  if (!node.children) return [];
  const result: ReactNode[] = [];
  node.children.forEach((child, i) => {
    if (child.componentType === 'forEach') {
      const sourcePath = ((child.props?.source as string) ?? '').replace(/^@/, '');
      const items = (resolveDotPath(state, sourcePath) as Record<string, unknown>[]) ?? [];
      items.forEach((item, j) => {
        const itemState = { ...state, item };
        result.push(
          <Fragment key={`${i}-${j}`}>
            {buildChildren(child, itemState, emit, channelId)}
          </Fragment>
        );
      });
    } else if (child.componentType === 'showIfItems' || child.componentType === 'showIfEmpty') {
      const sourcePath = ((child.props?.source as string) ?? '').replace(/^@/, '');
      const items = (resolveDotPath(state, sourcePath) as unknown[]) ?? [];
      const show = child.componentType === 'showIfItems' ? items.length > 0 : items.length === 0;
      if (show) {
        result.push(
          <Fragment key={i}>
            {buildChildren(child, state, emit, channelId)}
          </Fragment>
        );
      }
    } else if (child.componentType === 'showIf' || child.componentType === 'showIfNot') {
      const sourcePath = ((child.props?.source as string) ?? '').replace(/^@/, '');
      const value = Boolean(resolveDotPath(state, sourcePath));
      const show = child.componentType === 'showIf' ? value : !value;
      if (show) {
        result.push(
          <Fragment key={i}>
            {buildChildren(child, state, emit, channelId)}
          </Fragment>
        );
      }
    } else {
      result.push(
        <Suspense key={i} fallback={null}>
          {renderNode(child, state, emit, channelId)}
        </Suspense>
      );
    }
  });
  return result;
}

function renderNode(
  node: LayoutNode,
  state: Record<string, unknown>,
  emit: Props['emit'],
  channelId: string
): ReactNode {
  const Component = getLayoutComponent(node.componentType);
  if (!Component) {
    console.warn(`LayoutRenderer: unknown componentType "${node.componentType}"`);
    return null;
  }

  const resolvedProps = resolveProps(node.props, state);
  const resolvedEmits = resolveEmits(node.emits, emit);
  const children = buildChildren(node, state, emit, channelId);

  // Only fall back to the ambient channelId when the node's own JSON props don't
  // author a "channelId" key at all — an explicitly-authored value (even a currently
  // null one, e.g. layoutDocumentView's "@temp.nestedChannelId" before a session
  // exists) must be respected as-is, not silently replaced.
  const hasOwnChannelId = !!node.props && 'channelId' in node.props;

  return (
    <Component
      {...resolvedProps}
      {...resolvedEmits}
      emit={emit}
      targetId={node.targetId}
      channelId={hasOwnChannelId ? resolvedProps['channelId'] : channelId}
    >
      {children}
    </Component>
  );
}

export function LayoutRenderer({ nodes, state, emit, channelId }: Props) {
  return (
    <>
      {nodes.map((node, i) => (
        <Suspense key={i} fallback={<p className="doc-empty">Loading…</p>}>
          {renderNode(node, state, emit, channelId)}
        </Suspense>
      ))}
    </>
  );
}
