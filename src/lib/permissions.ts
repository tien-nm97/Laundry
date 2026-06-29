export interface PermissionChild {
  key: string
  label: string
}

export interface PermissionGroup {
  key: string
  label: string
  parentKey: string
  parentLabel: string
  children: PermissionChild[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'system',
    label: 'Quản trị Hệ thống',
    parentKey: 'system:all',
    parentLabel: 'Toàn quyền Quản trị Hệ thống',
    children: [
      { key: 'admin:view', label: 'Xem trang Admin Dashboard' },
      { key: 'admin:users', label: 'Quản lý Tài khoản (User)' },
      { key: 'admin:linen', label: 'Quản lý Loại đồ vải (Linen)' },
      { key: 'admin:ward', label: 'Quản lý Khoa phòng' },
      { key: 'admin:staff', label: 'Quản lý Hộ lý (Staff)' },
    ]
  },
  {
    key: 'inventory',
    label: 'Quản lý Kho đồ vải',
    parentKey: 'inventory:all',
    parentLabel: 'Toàn quyền Quản lý Kho',
    children: [
      { key: 'admin:batch', label: 'Nhập lô hàng mới (Import)' },
      { key: 'supervisor:laundry_procure', label: 'Lên kế hoạch đặt hàng (Thu mua)' },
      { key: 'supervisor:laundry_damage', label: 'Báo hỏng & Đề xuất tái chế đồ vải' },
      { key: 'inventory:min_stock', label: 'Sửa định mức tồn tối thiểu' },
    ]
  },
  {
    key: 'dispatch',
    label: 'Giám sát & Cấp phát',
    parentKey: 'dispatch:all',
    parentLabel: 'Toàn quyền Giám sát & Cấp phát',
    children: [
      { key: 'admin:ticket', label: 'Xử lý & Xác nhận cấp phát phiếu' },
      { key: 'supervisor:ward_history', label: 'Xem lịch sử yêu cầu của Khoa/Phòng' },
      { key: 'supervisor:laundry_aggregate', label: 'Quản lý yêu cầu tập trung' },
      { key: 'superior:cleaning', label: 'Giám sát Vệ sinh: Báo cáo đồ vải hư hỏng' },
    ]
  },
  {
    key: 'laundry',
    label: 'Nghiệp vụ Nhà giặt',
    parentKey: 'laundry:all',
    parentLabel: 'Toàn quyền Nghiệp vụ Nhà giặt',
    children: [
      { key: 'laundry:view', label: 'Truy cập giao diện Nhà giặt' },
    ]
  }
]

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(group => [
  group.parentKey,
  ...group.children.map(child => child.key)
])

// Help check if user has a permission, resolving parent-child relationship
export function hasPermission(userPerms: string[], requiredPerm: string): boolean {
  if (!userPerms || !Array.isArray(userPerms)) return false
  if (userPerms.includes(requiredPerm)) return true
  
  // If user has 'system:all', allow everything
  if (userPerms.includes('system:all')) return true
  
  // Find group containing this required permission
  const group = PERMISSION_GROUPS.find(g => 
    g.children.some(child => child.key === requiredPerm)
  )
  
  // If user has the parent permission of the group, return true
  if (group && userPerms.includes(group.parentKey)) {
    return true
  }
  
  return false
}
