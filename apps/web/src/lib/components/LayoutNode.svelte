<script lang="ts">
  import type { LayoutNode } from '@multiplayer-base/shared-types';
  import { getLayoutComponent } from '$lib/registry/layoutRegistry';
  import LayoutNodeSelf from './LayoutNode.svelte';

  let {
    node,
    state,
    emit,
  }: {
    node: LayoutNode;
    state: Record<string, unknown>;
    emit: (type: string, payload?: Record<string, unknown>) => void;
  } = $props();

  function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((curr, key) => {
      if (curr == null || typeof curr !== 'object') return undefined;
      return (curr as Record<string, unknown>)[key];
    }, obj);
  }

  function resolveProps(
    props: Record<string, string> | undefined,
    st: Record<string, unknown>
  ): Record<string, unknown> {
    if (!props) return {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      result[key] = value.startsWith('$') ? resolveDotPath(st, value.slice(1)) : value;
    }
    return result;
  }

  function resolveEmits(
    emits: Record<string, string> | undefined
  ): Record<string, (payload: Record<string, unknown>) => void> {
    if (!emits) return {};
    const result: Record<string, (payload: Record<string, unknown>) => void> = {};
    for (const [eventName, messageType] of Object.entries(emits)) {
      const propName = 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
      result[propName] = (payload: Record<string, unknown>) => emit(messageType, payload);
    }
    return result;
  }

  interface ChildItem {
    key: string;
    node: LayoutNode;
    state: Record<string, unknown>;
  }

  function buildChildItems(n: LayoutNode, st: Record<string, unknown>): ChildItem[] {
    if (!n.children) return [];
    const result: ChildItem[] = [];
    n.children.forEach((child, i) => {
      if (child.componentType === 'forEach') {
        const sourcePath = (child.props?.['source'] ?? '').replace(/^\$/, '');
        const items = (resolveDotPath(st, sourcePath) as Record<string, unknown>[]) ?? [];
        items.forEach((item, j) => {
          (child.children ?? []).forEach((template, k) => {
            result.push({ key: `${i}-${j}-${k}`, node: template, state: { ...st, item } });
          });
        });
      } else {
        result.push({ key: String(i), node: child, state: st });
      }
    });
    return result;
  }

  let loader = $derived(getLayoutComponent(node.componentType));
  let resolvedProps = $derived(resolveProps(node.props, state));
  let resolvedEmits = $derived(resolveEmits(node.emits));
  let childItems = $derived(buildChildItems(node, state));
</script>

{#if loader}
  {#await loader()}
    <!-- loading -->
  {:then module}
    {@const DynComp = module.default as any}
    <DynComp {...resolvedProps} {...resolvedEmits} targetId={node.targetId}>
      {#each childItems as child (child.key)}
        <LayoutNodeSelf node={child.node} state={child.state} {emit} />
      {/each}
    </DynComp>
  {:catch}
    <!-- component load failed -->
  {/await}
{/if}
