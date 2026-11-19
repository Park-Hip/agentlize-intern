import { z } from 'zod';

/**
 * The record types the gateway knows and the actions each adapter declares
 * (ADR-0007 section 3.2). A key in the rule file that is not listed here is a
 * typo, and a typo makes the whole file invalid instead of silently denying.
 */
export const RESOURCE_ACTIONS = {
  task: ['edit_task_description', 'change_task_status', 'change_task_assignee_or_due'],
  employee: ['edit_work_email'],
} as const;

export type ResourceType = keyof typeof RESOURCE_ACTIONS;
export type TableAction = (typeof RESOURCE_ACTIONS)[ResourceType][number];

export const TABLE_ACTIONS: readonly TableAction[] = Object.values(RESOURCE_ACTIONS).flat();

/** Reading one employee field is a question of its own, not a cell of the action table. */
export const READ_EMPLOYEE_FIELD = 'read_employee_field';
export const ACTIONS = [READ_EMPLOYEE_FIELD, ...TABLE_ACTIONS] as const;
export type PolicyAction = (typeof ACTIONS)[number];

const effectSchema = z.enum(['allow', 'deny', 'needs_approval']);
const scopeSchema = z.enum(['own_department', 'any']);

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
 */
export const rulesSchema = z
  .strictObject({
    schema: z.literal(2),
    version: z.number().int().positive(),
    approval: approvalSchema,
    cumulative_window_minutes: z.number().int().positive(),
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

      if (!Object.hasOwn(RESOURCE_ACTIONS, type)) {
        ctx.addIssue({ code: 'custom', message: `unknown record type "${type}"`, path });
        continue;
      }
      const knownActions: readonly string[] = RESOURCE_ACTIONS[type as ResourceType];
      for (const action of Object.keys(resource.actions)) {
        if (!knownActions.includes(action)) {
          ctx.addIssue({ code: 'custom', message: `unknown action "${action}" for "${type}"`, path: [...path, 'actions', action] });
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
