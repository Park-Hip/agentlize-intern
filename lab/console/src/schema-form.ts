/**
 * The playground form is built from the `input_schema` of `GET /v1/tools`, the
 * same JSON schema `/mcp` publishes (ADR-0006 section 3.2). Nothing here knows
 * a tool by name: a tool the gateway adds later gets a form on the next load.
 */

export type FieldKind = 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'object' | 'array';

export interface FormField {
  /** `task_ids` or `changes.assignee`; the form field is `arg.<path>`. */
  readonly path: string;
  readonly name: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly enumValues: readonly string[];
  /** A string whose format is a calendar date, so the browser can show a date picker. */
  readonly date: boolean;
  /** A string long enough to want a text area. */
  readonly long: boolean;
  readonly maxLength: number | null;
  readonly children: readonly FormField[];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredNames(schema: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const required = schema['required'];
  return new Set(Array.isArray(required) ? required.filter((value): value is string => typeof value === 'string') : []);
}

/** The exact pattern `propose_task_change` publishes for `due`: `^\d{4}-\d{2}-\d{2}$`. */
const DATE_PATTERN = /^\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$$/;

function kindOf(schema: Readonly<Record<string, unknown>>): FieldKind | undefined {
  if (Array.isArray(schema['enum'])) return 'enum';
  const type = schema['type'];
  if (type === 'string' || type === 'integer' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return 'object';
  if (type === 'array') {
    const items = asRecord(schema['items']);
    return items?.['type'] === 'string' ? 'array' : undefined;
  }
  return undefined;
}

/** A JSON schema node as one form field. Unknown nodes become a text field, so no parameter silently disappears. */
function fieldOf(path: string, name: string, value: unknown, required: boolean): FormField | undefined {
  const schema = asRecord(value);
  if (schema === undefined) return undefined;
  const kind = kindOf(schema) ?? 'string';
  const properties = asRecord(schema['properties']);
  const children =
    kind === 'object' && properties !== undefined
      ? Object.entries(properties).flatMap(([childName, childSchema]) => {
          const child = fieldOf(`${path}.${childName}`, childName, childSchema, requiredNames(schema).has(childName));
          return child === undefined ? [] : [child];
        })
      : [];
  const maxLength = typeof schema['maxLength'] === 'number' ? schema['maxLength'] : null;
  const pattern = typeof schema['pattern'] === 'string' ? schema['pattern'] : '';

  return {
    path,
    name,
    kind,
    required,
    enumValues: Array.isArray(schema['enum'])
      ? schema['enum'].filter((choice): choice is string => typeof choice === 'string')
      : [],
    date: kind === 'string' && DATE_PATTERN.test(pattern),
    long: kind === 'string' && maxLength !== null && maxLength >= 200,
    maxLength,
    children,
  };
}

/** The top-level parameters of one tool's `input_schema`, in the order the schema declares them. */
export function formFields(inputSchema: Readonly<Record<string, unknown>>): readonly FormField[] {
  const properties = asRecord(inputSchema['properties']);
  if (properties === undefined) return [];
  const required = requiredNames(inputSchema);
  return Object.entries(properties).flatMap(([name, schema]) => {
    const field = fieldOf(name, name, schema, required.has(name));
    return field === undefined ? [] : [field];
  });
}

/** Every leaf field, without the object wrappers, so a caller can read or fill one flat list. */
export function leafFields(fields: readonly FormField[]): readonly FormField[] {
  return fields.flatMap((field) => (field.kind === 'object' ? leafFields(field.children) : [field]));
}

export function formFieldName(field: FormField): string {
  return `arg.${field.path}`;
}

type ValueResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly problem: string };

function valueOf(field: FormField, raw: string): ValueResult {
  switch (field.kind) {
    case 'integer':
      return /^-?\d+$/.test(raw)
        ? { ok: true, value: Number(raw) }
        : { ok: false, problem: `Tham số ${field.path} phải là số nguyên.` };
    case 'number': {
      const number = Number(raw);
      return Number.isFinite(number)
        ? { ok: true, value: number }
        : { ok: false, problem: `Tham số ${field.path} phải là số.` };
    }
    case 'boolean':
      if (raw === 'true') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false, problem: `Tham số ${field.path} phải là true hoặc false.` };
    case 'enum':
      return field.enumValues.includes(raw)
        ? { ok: true, value: raw }
        : { ok: false, problem: `Tham số ${field.path} phải là một trong: ${field.enumValues.join(', ')}.` };
    case 'array': {
      const values = raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '');
      return values.length === 0
        ? { ok: false, problem: `Tham số ${field.path} cần ít nhất một giá trị, cách nhau bằng dấu phẩy.` }
        : { ok: true, value: values };
    }
    default:
      return { ok: true, value: raw };
  }
}

export type ArgsResult =
  | { readonly ok: true; readonly args: Record<string, unknown> }
  | { readonly ok: false; readonly problem: string };

function collect(fields: readonly FormField[], form: URLSearchParams): ArgsResult {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = (form.get(formFieldName(field)) ?? '').trim();
    if (field.kind === 'object') {
      const nested = collect(field.children, form);
      if (!nested.ok) return nested;
      const hasValue = Object.keys(nested.args).length > 0;
      // A required object travels even when empty, so the gateway can say what
      // it needs instead of the console inventing its own rule.
      if (hasValue || field.required) args[field.name] = nested.args;
      continue;
    }
    if (raw === '') continue;
    const value = valueOf(field, raw);
    if (!value.ok) return value;
    args[field.name] = value.value;
  }
  return { ok: true, args };
}

/**
 * Turn one submitted form into the JSON arguments of a tool call. Empty fields
 * are left out, because an absent optional parameter and an empty string are
 * different requests.
 */
export function readArgs(fields: readonly FormField[], form: URLSearchParams): ArgsResult {
  return collect(fields, form);
}

/** The values a form submitted, so a re-rendered page shows what the person typed. */
export function formValues(fields: readonly FormField[], form: URLSearchParams): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const field of leafFields(fields)) {
    const raw = form.get(formFieldName(field)) ?? '';
    if (raw !== '') values.set(field.path, raw);
  }
  return values;
}

/** The arguments of a scenario as form values, so pressing a scenario button also fills the form. */
export function argsToFormValues(
  fields: readonly FormField[],
  args: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  const walk = (list: readonly FormField[], source: Readonly<Record<string, unknown>>): void => {
    for (const field of list) {
      if (field.kind === 'object') {
        const child = asRecord(source[field.name]);
        if (child !== undefined) walk(field.children, child);
        continue;
      }
      const value = source[field.name];
      if (field.kind === 'array') {
        if (Array.isArray(value)) {
          const list = value.filter((entry): entry is string => typeof entry === 'string');
          if (list.length > 0) values.set(field.path, list.join(', '));
        }
        continue;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        values.set(field.path, String(value));
      }
    }
  };
  walk(fields, args);
  return values;
}
