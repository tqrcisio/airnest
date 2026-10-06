import { hashDag, InvalidDagError, validateDag, type DagDefinition } from '../src/index.js';
import { dag, task } from './support.js';

describe('validateDag', () => {
  it('names every task inside a cycle', () => {
    const cyclic = dag('sales', task('extract'), task('a', ['extract', 'c']), task('b', ['a']), task('c', ['b']));
    expect(() => validateDag(cyclic)).toThrow('tasks a, b, c form a cycle');
  });

  it('collects every problem instead of stopping at the first', () => {
    const broken = dag('sales', task('load', ['extract']), task('load'));
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

  it('rejects a DAG without tasks', () => {
    expect(() => validateDag(dag('empty'))).toThrow(InvalidDagError);
  });
});

describe('hashDag', () => {
  it('ignores key order and undefined fields', () => {
    const sales = dag('sales', task('extract'));
    const reordered = { ...Object.fromEntries(Object.entries(sales).reverse()), params: undefined } as DagDefinition;
    expect(hashDag(reordered)).toBe(hashDag(sales));
  });

  it('changes when a dependency changes', () => {
    expect(hashDag(dag('sales', task('a'), task('b', ['a'])))).not.toBe(hashDag(dag('sales', task('a'), task('b'))));
  });
});
