export const DEPARTMENTS = ['Vận hành', 'Kinh doanh'] as const;

export type Department = (typeof DEPARTMENTS)[number];

/** Roles from the permission matrix in PRD section 3.2. */
export const ROLES = ['intern', 'staff', 'lead', 'hr'] as const;

export type EmployeeRole = (typeof ROLES)[number];

/** Employee codes look like `NV-07`. The gateway identifies people by this code, never by email. */
export const EMPLOYEE_ID_PATTERN = /^NV-\d{2}$/;

export interface Persona {
  readonly employeeId: string;
  readonly fullName: string;
  readonly department: Department;
  readonly role: EmployeeRole;
}

/**
 * The six named characters of the lab scenarios (spec section 2.1).
 * Their codes are fixed so the gateway, the tests and the fake systems agree
 * without looking anyone up by name.
 * Nhung works in Vận hành on purpose: the read-only key test needs a task in
 * her own department while her full key can still change it.
 */
export const PERSONAS = {
  hoa: { employeeId: 'NV-03', fullName: 'Nguyễn Thị Hoa', department: 'Vận hành', role: 'staff' },
  nam: { employeeId: 'NV-04', fullName: 'Lê Hoàng Nam', department: 'Vận hành', role: 'intern' },
  quang: { employeeId: 'NV-01', fullName: 'Trần Văn Quang', department: 'Vận hành', role: 'lead' },
  nhung: { employeeId: 'NV-02', fullName: 'Phạm Thị Nhung', department: 'Vận hành', role: 'hr' },
  lan: { employeeId: 'NV-05', fullName: 'Đỗ Thị Lan', department: 'Vận hành', role: 'staff' },
  minh: { employeeId: 'NV-06', fullName: 'Vũ Quốc Minh', department: 'Vận hành', role: 'staff' },
} as const satisfies Record<string, Persona>;

export type PersonaName = keyof typeof PERSONAS;
