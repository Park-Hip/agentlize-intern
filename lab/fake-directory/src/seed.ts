import { PERSONAS, type Department, type EmployeeRole, type Persona } from '@lab/shared';

/** The document stored for one employee. Code and version live in their own columns. */
export type EmployeeDocument = Record<string, string>;

export interface SeedEmployee {
  readonly employeeId: string;
  readonly document: EmployeeDocument;
}

function build(
  employeeId: string,
  fullName: string,
  department: Department,
  role: EmployeeRole,
  emailLocalPart: string,
): SeedEmployee {
  const n = employeeId.slice(3);
  return {
    employeeId,
    document: {
      full_name: fullName,
      department,
      role,
      work_email: `${emailLocalPart}@lab.example`,
      // Obviously fake on purpose: the 555 block and a street that does not exist.
      personal_phone: `0900 555 0${n}`,
      home_address: `Số ${n} Đường Giả Định, Quận Mẫu, Thành phố Thử Nghiệm`,
    },
  };
}

function persona(p: Persona, emailLocalPart: string): SeedEmployee {
  return build(p.employeeId, p.fullName, p.department, p.role, emailLocalPart);
}

/**
 * The fixed starting data: 20 people in two departments, one lead each.
 * Nothing here is random, so every reset gives the same directory.
 */
export const SEED_EMPLOYEES: readonly SeedEmployee[] = [
  persona(PERSONAS.quang, 'quang.tran'),
  persona(PERSONAS.nhung, 'nhung.pham'),
  persona(PERSONAS.hoa, 'hoa.nguyen'),
  persona(PERSONAS.nam, 'nam.le'),
  persona(PERSONAS.lan, 'lan.do'),
  persona(PERSONAS.minh, 'minh.vu'),
  build('NV-07', 'Bùi Thanh Tâm', 'Vận hành', 'staff', 'tam.bui'),
  build('NV-08', 'Ngô Đức Hải', 'Vận hành', 'staff', 'hai.ngo'),
  build('NV-09', 'Đặng Thu Hà', 'Vận hành', 'intern', 'ha.dang'),
  build('NV-10', 'Phan Bảo Châu', 'Vận hành', 'staff', 'chau.phan'),
  build('NV-11', 'Hoàng Gia Bảo', 'Kinh doanh', 'lead', 'bao.hoang'),
  build('NV-12', 'Lý Ngọc Anh', 'Kinh doanh', 'staff', 'anh.ly'),
  build('NV-13', 'Võ Thanh Sơn', 'Kinh doanh', 'staff', 'son.vo'),
  build('NV-14', 'Dương Mai Phương', 'Kinh doanh', 'staff', 'phuong.duong'),
  build('NV-15', 'Trịnh Công Danh', 'Kinh doanh', 'staff', 'danh.trinh'),
  build('NV-16', 'Huỳnh Kim Ngân', 'Kinh doanh', 'staff', 'ngan.huynh'),
  build('NV-17', 'Mai Anh Tuấn', 'Kinh doanh', 'staff', 'tuan.mai'),
  build('NV-18', 'Lương Thùy Dung', 'Kinh doanh', 'intern', 'dung.luong'),
  build('NV-19', 'Đinh Quốc Khánh', 'Kinh doanh', 'staff', 'khanh.dinh'),
  build('NV-20', 'Tạ Hồng Nhật', 'Kinh doanh', 'intern', 'nhat.ta'),
];
