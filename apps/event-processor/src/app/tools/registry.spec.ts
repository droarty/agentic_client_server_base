import { resolveTools } from './registry';

describe('get_reference_section tool', () => {
  const [tool] = resolveTools(['get_reference_section']);

  test('resolveTools returns the tool definition', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('get_reference_section');
  });

  test('valid section returns real file content', async () => {
    const result = await tool.execute({ section: 'steps-and-routes' });
    expect(result).toContain('# Steps and Routes');
  });

  test('unknown section returns an error string instead of throwing', async () => {
    const result = await tool.execute({ section: 'not-a-real-section' });
    expect(result).toContain('Unknown section');
    expect(result).toContain('not-a-real-section');
  });

  test('missing section input returns an error string instead of throwing', async () => {
    const result = await tool.execute({});
    expect(result).toContain('Unknown section');
  });
});

describe('resolveTools', () => {
  test('drops unknown tool names without throwing', () => {
    const tools = resolveTools(['not-a-real-tool']);
    expect(tools).toEqual([]);
  });

  test('returns known tools and silently drops unknown ones from a mixed list', () => {
    const tools = resolveTools(['get_reference_section', 'not-a-real-tool']);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('get_reference_section');
  });
});
