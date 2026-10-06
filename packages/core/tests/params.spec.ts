import { InvalidParamsError, resolveParams } from '../src/index.js';

const schema = {
  type: 'object',
  properties: {
    customers: { type: 'array', items: { type: 'string' }, default: ['acme'] },
    dryRun: { type: 'boolean', default: false },
    region: { type: 'string', enum: ['north', 'south'] },
  },
  required: ['region'],
  additionalProperties: false,
};

describe('resolveParams', () => {
  it('fills defaults without touching the input', () => {
    const input = { region: 'north' };
    expect(resolveParams(schema, input)).toEqual({ region: 'north', customers: ['acme'], dryRun: false });
    expect(input).toEqual({ region: 'north' });
  });

  it('reports every problem with the field it concerns', () => {
    try {
      resolveParams(schema, { region: 'east', customers: 'acme', extra: 1 });
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidParamsError).problems).toEqual([
        'params must NOT have additional properties',
        'customers must be array',
        'region must be equal to one of the allowed values',
      ]);
    }
  });

  it('passes params through when the DAG declares no schema', () => {
    expect(resolveParams(undefined, { anything: true })).toEqual({ anything: true });
  });
});
