import { z } from 'zod';

/**
 * The seven actions of the permission table plus reading one employee field.
 * Adding an action means adding it here and a cell for it in every role of
 * `rules.json`; an action missing from the file makes the whole file invalid.
 */
export const TABLE_ACTIONS = [
  'edit_task_description',
  'change_task_status',
  'change_task_assignee_or_due',
  'bulk_change',
  'edit_other_department_task',
  'edit_directory',
] as const;

export const ACTIONS = ['read_employee_field', ...TABLE_ACTIONS] as const;

export type TableAction = (typeof TABLE_ACTIONS)[number];
export type PolicyAction = (typeof ACTIONS)[number];

const effectSchema = z.enum(['allow', 'deny', 'needs_approval']);

const roleCellsSchema = z.strictObject({
  edit_task_description: effectSchema,
  change_task_status: effectSchema,
  change_task_assignee_or_due: effectSchema,
  bulk_change: effectSchema,
  edit_other_department_task: effectSchema,
  edit_directory: effectSchema,
});

/** Shape of `rules.json`. Strict, so a typo in a key invalidates the file instead of silently denying. */
export const rulesSchema = z
  .strictObject({
    version: z.number().int().positive(),
    bulk_threshold: z.number().int().positive(),
    roles: z.record(z.string().min(1), roleCellsSchema),
    employee_fields: z.record(z.string().min(1), z.array(z.string().min(1))),
  })
  .refine((rules) => Object.keys(rules.roles).length > 0, { message: 'roles must not be empty' })
  .refine(
    (rules) => {
      const roles = Object.keys(rules.roles).sort();
      const fieldRoles = Object.keys(rules.employee_fields).sort();
      return roles.length === fieldRoles.length && roles.every((role, i) => role === fieldRoles[i]);
    },
    { message: 'roles and employee_fields must list the same roles' },
  );

export type Rules = z.infer<typeof rulesSchema>;

/** The caller asking: employee id, role and department, all taken from the directory, never from the model. */
export const actorSchema = z.strictObject({
  id: z.string().min(1),
  role: z.string().min(1),
  department: z.string().min(1),
});

/**
 * What the action touches. `department` is the department that owns the task,
 * `taskCount` the number of tasks one command changes, `field` the employee
 * field that is read.
 */
export const policyObjectSchema = z.strictObject({
  kind: z.enum(['employee', 'task']),
  department: z.string().min(1).optional(),
  taskCount: z.number().int().nonnegative().optional(),
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
