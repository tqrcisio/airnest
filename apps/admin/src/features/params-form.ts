type JsonSchemaProperty = {
  type?: string;
  enum?: unknown[];
  items?: { type?: string };
  default?: unknown;
  title?: string;
};

export type ParamField =
  | { name: string; label: string; control: 'text' | 'number' | 'boolean' | 'json'; initial: string | boolean }
  | { name: string; label: string; control: 'list'; itemType: 'string' | 'number'; initial: string }
  | { name: string; label: string; control: 'choice'; choices: string[]; initial: string };

function labelOf(name: string, property: JsonSchemaProperty) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return property.title ?? words.replace(/^\w/, (first) => first.toUpperCase());
}

export function paramFields(schema: Record<string, unknown> | null): ParamField[] {
  const properties = (schema?.properties ?? {}) as Record<string, JsonSchemaProperty>;
  return Object.entries(properties).map(([name, property]) => {
    const label = labelOf(name, property);
    if (property.enum) {
      return {
        name,
        label,
        control: 'choice',
        choices: property.enum.map(String),
        initial: String(property.default ?? property.enum[0] ?? ''),
      };
    }
    switch (property.type) {
      case 'string':
        return { name, label, control: 'text', initial: String(property.default ?? '') };
      case 'number':
      case 'integer':
        return {
          name,
          label,
          control: 'number',
          initial: property.default === undefined ? '' : String(property.default),
        };
      case 'boolean':
        return { name, label, control: 'boolean', initial: Boolean(property.default) };
      case 'array':
        if (property.items?.type === 'string' || property.items?.type === 'number') {
          const initial = Array.isArray(property.default) ? property.default.join(', ') : '';
          return { name, label, control: 'list', itemType: property.items.type, initial };
        }
        return { name, label, control: 'json', initial: JSON.stringify(property.default ?? [], null, 2) };
      default:
        return { name, label, control: 'json', initial: JSON.stringify(property.default ?? null, null, 2) };
    }
  });
}

export class InvalidParam extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export function toParams(fields: ParamField[], values: Record<string, string | boolean>) {
  const params: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.control === 'boolean') {
      params[field.name] = Boolean(raw);
      continue;
    }
    const text = String(raw ?? '').trim();
    if (text === '') continue;

    if (field.control === 'number') {
      const parsed = Number(text);
      if (Number.isNaN(parsed)) throw new InvalidParam(field.name, 'Enter a number');
      params[field.name] = parsed;
    } else if (field.control === 'list') {
      const items = text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (field.itemType === 'number' && items.some((item) => Number.isNaN(Number(item)))) {
        throw new InvalidParam(field.name, 'Separate numbers with commas');
      }
      params[field.name] = field.itemType === 'number' ? items.map(Number) : items;
    } else if (field.control === 'json') {
      try {
        params[field.name] = JSON.parse(text);
      } catch {
        throw new InvalidParam(field.name, 'Invalid JSON');
      }
    } else {
      params[field.name] = text;
    }
  }
  return params;
}
