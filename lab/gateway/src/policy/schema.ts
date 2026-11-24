import { z } from 'zod';
import { ADAPTER_DECLARATIONS, actionsByType } from '../adapters/registry.js';
import type { RecordDeclaration } from '../adapters/types.js';
import { CLIENT_CLASSES, DATA_CLASSES } from './data-classes.js';

/**
 * The action names of each record type, from the adapters the gateway ships
 * with (ADR-0007 section 3.2). A key in the rule file that no adapter declares
 * is a typo, and a typo makes the whole file invalid instead of silently
 * denying. A running gateway builds its own map from the adapters it started
 * with, so a test adapter may declare an action of its own.
 */
export const RESOURCE_ACTIONS = actionsByType(ADAPTER_DECLARATIONS);

export const TABLE_ACTIONS: readonly string[] = [...new Set(Object.values(RESOURCE_ACTIONS).flat())];

/** Reading one employee field is a question of its own, not a cell of the action table. */
export const READ_EMPLOYEE_FIELD = 'read_employee_field';

/** Everything the rule file can name: the employee-field read and every action of every adapter. */
export const ACTIONS: readonly string[] = [READ_EMPLOYEE_FIELD, ...TABLE_ACTIONS];

/** An action name from an adapter. The adapter registry decides which names exist. */
export type TableAction = string;
export type PolicyAction = string;

const effectSchema = z.enum(['allow', 'deny', 'needs_approval']);
const scopeSchema = z.enum(['own_department', 'any']);
const dataClassSchema = z.enum(DATA_CLASSES);
const clientClassSchema = z.enum(CLIENT_CLASSES);

/** One client profile: a reporting label and the limit that actually decides (ADR-0010 section 3.2). */
const clientProfileSchema = z.strictObject({
  class: clientClassSchema,
  ceiling: dataClassSchema,
});

/**
 * The client table. Missing means an empty table, so every client gets the
 * lowest class; a misspelt class or ceiling makes the whole file invalid.
 */
const clientsSchema = z.record(z.string().min(1), clientProfileSchema).default({});

/** One role on one action: what it may do, in which department, and what happens at the bulk threshold. */
const cellSchema = z
  .strictObject({
    effect: effectSchema,
    scope: scopeSchema.optional(),
    bulk: effectSchema.optional(),
  })
  .refine((cell) => cell.effect === 'deny' || cell.scope !== undefined, {
    message: 'an allow or needs_approval cell must declare its scope',
  });

const resourceSchema = z
  .strictObject({
    bulk_threshold: z.number().int().positive(),
    read: z.record(z.string().min(1), scopeSchema),
    fields: z.record(z.string().min(1), z.array(z.string().min(1))),
    /**
     * One class per field. Missing is allowed on purpose: a field the file has
     * not classified yet is dropped at read time (ADR-0010 section 3.3), while
     * a misspelt field name is a typo and refuses the whole file.
     */
    data_classes: z.record(z.string().min(1), dataClassSchema).default({}),
    actions: z.record(z.string().min(1), z.record(z.string().min(1), cellSchema)),
  })
  .refine(
    (resource) => {
      const readRoles = Object.keys(resource.read).sort();
      const fieldRoles = Object.keys(resource.fields).sort();
      return readRoles.length === fieldRoles.length && readRoles.every((role, i) => role === fieldRoles[i]);
    },
    { message: 'read and fields must list the same roles' },
  )
  .refine(
    (resource) => {
      const roles = new Set(Object.keys(resource.read));
      return Object.values(resource.actions).every((cells) => Object.keys(cells).every((role) => roles.has(role)));
    },
    { message: 'every action cell must name a role that read and fields declare' },
  );

export const approvalSchema = z.strictObject({
  approver_roles: z.array(z.string().min(1)).min(1),
  same_department: z.boolean(),
  wait_minutes: z.number().int().positive(),
});

/**
 * Shape of `rules.json`, schema 2 (ADR-0007 section 3.2). Strict at every
 * level, so a misspelt record type, action or role makes the whole file
 * invalid and every command is refused with `POLICY_UNAVAILABLE`.
 *
 * `declarations` is the adapter registry the gateway is running with, so a
 * new adapter action is a valid rule name without editing this file.
 */
export function createRulesSchema(declarations: readonly RecordDeclaration[] = ADAPTER_DECLARATIONS) {
  const knownActions = actionsByType(declarations);
  return z
    .strictObject({
      schema: z.literal(2),
      version: z.number().int().positive(),
      approval: approvalSchema,
      cumulative_window_minutes: z.number().int().positive(),
      clients: clientsSchema,
      resources: z.record(z.string().min(1), resourceSchema),
    })
    .superRefine((rules, ctx) => {
      const types = Object.keys(rules.resources);
      if (types.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'resources must not be empty', path: ['resources'] });
        return;
      }

      let roleSet: readonly string[] | undefined;
      for (const type of types) {
        const resource = rules.resources[type];
        if (resource === undefined) continue;
        const path = ['resources', type];

        const actions = Object.hasOwn(knownActions, type) ? knownActions[type] : undefined;
        if (actions === undefined) {
          ctx.addIssue({ code: 'custom', message: `unknown record type "${type}"`, path });
          continue;
        }
        for (const action of Object.keys(resource.actions)) {
          if (!actions.includes(action)) {
            ctx.addIssue({ code: 'custom', message: `unknown action "${action}" for "${type}"`, path: [...path, 'actions', action] });
          }
        }

        const declaration = declarations.find((candidate) => candidate.type === type);
        const declaredFields = new Set(declaration?.fields.map((field) => field.name) ?? []);
        for (const field of Object.keys(resource.data_classes)) {
          if (!declaredFields.has(field)) {
            ctx.addIssue({
              code: 'custom',
              message: `unknown field "${field}" in data_classes for "${type}"`,
              path: [...path, 'data_classes', field],
            });
          }
        }

        const roles = Object.keys(resource.read).sort();
        if (roleSet === undefined) {
          roleSet = roles;
        } else if (roleSet.length !== roles.length || !roleSet.every((role, i) => role === roles[i])) {
          ctx.addIssue({ code: 'custom', message: 'every record type must list the same roles', path });
        }
      }

      for (const role of rules.approval.approver_roles) {
        if (roleSet !== undefined && !roleSet.includes(role)) {
          ctx.addIssue({ code: 'custom', message: `approver role "${role}" is not a role of the file`, path: ['approval', 'approver_roles'] });
        }
      }
    });
}

/** The shape the shipped gateway validates against. */
export const rulesSchema = createRulesSchema();

export type Rules = z.infer<typeof rulesSchema>;
export type ActionCell = z.infer<typeof cellSchema>;
export type ReadScope = z.infer<typeof scopeSchema>;

/** The caller asking: employee id, role and department, all taken from the directory, never from the model. */
export const actorSchema = z.strictObject({
  id: z.string().min(1),
  role: z.string().min(1),
  department: z.string().min(1),
});

/**
 * What the action touches. `kind` is the record type of the adapter,
 * `department` the department that owns the record, `taskCount` the number of
 * records one command changes, `carriedItems` the items of the same action
 * already counted in the cumulative window, `field` the employee field that is
 * read (ADR-0007 sections 3.2 and 3.4).
 */
export const policyObjectSchema = z.strictObject({
  kind: z.string().min(1),
  department: z.string().min(1).optional(),
  taskCount: z.number().int().nonnegative().optional(),
  carriedItems: z.number().int().nonnegative().optional(),
  field: z.string().min(1).optional(),
});

/** Where the call comes from and what the key declared. `scope` is the narrowing of section 3.2 of the PRD. */
export const policyContextSchema = z.strictObject({
  scope: z.enum(['read_only', 'read_write']),
  caller: z.string().min(1),
});

export const policyInputSchema = z.strictObject({
  actor: actorSchema,
  action: z.string(),
  object: policyObjectSchema,
  context: policyContextSchema,
});

export type PolicyInput = z.infer<typeof policyInputSchema>;
