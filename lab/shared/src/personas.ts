/**
 * The seven fake people the lab issues keys for (spec section 2.1).
 * Employee codes are fixed so the directory seed and the key seed agree.
 * The guest has a valid key but no entry in the directory.
 */
export interface Persona {
  readonly slug: string;
  readonly employeeId: string;
  readonly label: string;
}

export const PERSONAS: readonly Persona[] = [
  { slug: 'hoa', employeeId: 'NV-07', label: 'Chị Hoa (nhân viên Vận hành)' },
  { slug: 'nam', employeeId: 'NV-12', label: 'Nam (thực tập sinh)' },
  { slug: 'quang', employeeId: 'NV-03', label: 'Anh Quang (trưởng nhóm Vận hành)' },
  { slug: 'nhung', employeeId: 'NV-05', label: 'Chị Nhung (nhân sự)' },
  { slug: 'lan', employeeId: 'NV-09', label: 'Chị Lan (người bị chuyển việc)' },
  { slug: 'minh', employeeId: 'NV-11', label: 'Anh Minh (người nhận việc)' },
  { slug: 'khach', employeeId: 'NV-99', label: 'Khách (có khoá, không có trong danh bạ)' },
];
