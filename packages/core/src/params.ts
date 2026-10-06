import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

export class InvalidParamsError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid params: ${problems.join('; ')}`);
  }
}

const ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

function validatorFor(schema: Record<string, unknown>) {
  const key = JSON.stringify(schema);
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validators.set(key, validate);
  }
  return validate;
}

function describe(error: ErrorObject) {
  const where = error.instancePath ? error.instancePath.slice(1).replaceAll('/', '.') : 'params';
  return `${where} ${error.message}`;
}

export function resolveParams(
  schema: Record<string, unknown> | null | undefined,
  params: Record<string, unknown> = {},
) {
  if (!schema) return params;
  const resolved = structuredClone(params);
  const validate = validatorFor(schema);
  if (!validate(resolved)) throw new InvalidParamsError((validate.errors ?? []).map(describe));
  return resolved;
}
