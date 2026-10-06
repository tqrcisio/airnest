import { defineDag, hashDag, InvalidDagError, validateDag, type DagDefinition } from '../src/index.js';

const task = (id: string, upstream: string[] = []) => ({
  id,
  upstream,
  triggerRule: 'all_success' as const,
  retries: 0,
  retryDelayMs: 0,
  retryBackoff: 'fixed' as const,
  maxRetryDelayMs: 0,
});

const dagOf = (...tasks: ReturnType<typeof task>[]): DagDefinition => ({
  id: 'sales',
  schedule: null,
  catchup: false,
  maxActiveRuns: 1,
  tags: [],
  tasks,
});

describe('validateDag', () => {
  it('names every task inside a cycle', () => {
    const cyclic = dagOf(task('extract'), task('a', ['extract', 'c']), task('b', ['a']), task('c', ['b']));
    expect(() => validateDag(cyclic)).toThrow('tasks a, b, c form a cycle');
  });

  it('collects every problem instead of stopping at the first', () => {
    const broken = dagOf(task('load', ['extract']), task('load'));
    try {
      validateDag(broken);
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidDagError).problems).toEqual([
        'task load is declared twice',
        'task load depends on unknown task extract',
      ]);
    }
  });
});

describe('hashDag', () => {
  it('ignores key order and undefined fields', () => {
    const dag = dagOf(task('extract'));
    const reordered = { ...Object.fromEntries(Object.entries(dag).reverse()), params: undefined } as DagDefinition;
    expect(hashDag(reordered)).toBe(hashDag(dag));
  });

  it('changes when a dependency changes', () => {
    expect(hashDag(dagOf(task('a'), task('b', ['a'])))).not.toBe(hashDag(dagOf(task('a'), task('b'))));
  });
});

describe('defineDag', () => {
  it('wires dependencies from task references and applies DAG defaults', () => {
    const { definition, handlers } = defineDag(
      { id: 'sales_daily', schedule: '0 3 * * *', timezone: 'America/Sao_Paulo', defaults: { retries: 2 } },
      (dag) => {
        const extract = dag.task('extract', () => [1, 2, 3]);
        dag.task('load', { after: [extract], retries: 5 }, (ctx) => ctx.output(extract).length);
      },
    );

    expect(definition.schedule).toEqual({ cron: '0 3 * * *', timezone: 'America/Sao_Paulo' });
    expect(definition.tasks.map(({ id, upstream, retries }) => ({ id, upstream, retries }))).toEqual([
      { id: 'extract', upstream: [], retries: 2 },
      { id: 'load', upstream: ['extract'], retries: 5 },
    ]);
    expect([...handlers.keys()]).toEqual(['extract', 'load']);
  });

  it('rejects a DAG without tasks', () => {
    expect(() => defineDag({ id: 'empty' }, () => {})).toThrow(InvalidDagError);
  });
});
