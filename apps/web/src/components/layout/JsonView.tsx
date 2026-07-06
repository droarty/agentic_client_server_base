interface Props {
  config?: Record<string, unknown> | null;
  emptyMessage?: string;
}

export function JsonView({ config, emptyMessage = 'Nothing to display yet.' }: Props) {
  if (!config) {
    return <div className="json-view--empty">{emptyMessage}</div>;
  }
  return <pre className="json-view">{JSON.stringify(config, null, 2)}</pre>;
}
