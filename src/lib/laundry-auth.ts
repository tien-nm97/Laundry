// Thao tác ánh xạ Role và Rank của BIH sang phân quyền của phân hệ Laundry
// Bạn có thể đặt tệp tin này vào `lib/services/laundry-auth.ts` trên hệ thống BIH.

export type BIHRole = 'ADMIN' | 'TECHNICAL' | 'NURSING' | 'DRIVER' | 'SECURITY' | 'SUPPLY' | 'ENVIRONMENT';
export type BIHRank = 'MANAGER' | 'LEADER' | 'SUPERVISOR' | 'STAFF';

/**
 * Trả về danh sách các quyền hạn của Laundry dựa trên Vai trò và Chức vụ của BIH
 */
export function getLaundryPermissions(role: BIHRole, rank: BIHRank): string[] {
  // ADMIN mặc định có tất cả quyền trong hệ thống
  if (role === 'ADMIN') {
    return [
      'laundry:all', 
      'inventory:all', 
      'dispatch:all',
      'users:manage',
      'users:view',
      'linen:manage',
      'linen:view',
      'ward:manage',
      'ward:view',
      'staff:manage',
      'staff:view'
    ];
  }

  // Tổ Vật tư (SUPPLY) chịu trách nhiệm quản lý Kho & Nhà giặt
  if (role === 'SUPPLY') {
    if (rank === 'MANAGER' || rank === 'LEADER' || rank === 'SUPERVISOR') {
      return [
        'inventory:view',
        'inventory:import',
        'inventory:circulate',
        'inventory:discard',
        'inventory:min_stock',
        'laundry:view',
        'laundry:manage',
        'dispatch:view',
        'dispatch:manage',
        'linen:view',
        'ward:view',
        'staff:view'
      ];
    }
    // Nhân viên cấp dưới Tổ Vật tư
    return [
      'inventory:view', 
      'laundry:view', 
      'laundry:manage',
      'linen:view',
      'ward:view'
    ];
  }

  // Tổ Điều dưỡng (NURSING) gửi yêu cầu và theo dõi cấp phát tại khoa phòng
  if (role === 'NURSING') {
    if (rank === 'MANAGER' || rank === 'LEADER' || rank === 'SUPERVISOR') {
      return [
        'dispatch:view', 
        'dispatch:manage',
        'linen:view',
        'ward:view'
      ];
    }
    // Điều dưỡng viên thông thường
    return [
      'dispatch:view',
      'linen:view',
      'ward:view'
    ];
  }

  // Các vai trò khác (TECHNICAL, DRIVER, SECURITY...) không có quyền trong phân hệ Laundry
  return [];
}

/**
 * Kiểm tra xem danh sách quyền hiện tại có chứa quyền yêu cầu hay không
 */
export function hasLaundryPermission(userPermissions: string[] | null | undefined, requiredPermission: string): boolean {
  const perms = userPermissions || [];
  
  if (perms.includes(requiredPermission)) return true;
  
  // Kiểm tra quyền cha (all-access)
  if (requiredPermission.startsWith('inventory:') && perms.includes('inventory:all')) return true;
  if (requiredPermission.startsWith('laundry:') && perms.includes('laundry:all')) return true;
  if (requiredPermission.startsWith('dispatch:') && perms.includes('dispatch:all')) return true;
  
  return false;
}
