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
    label: 'Quản trị Hệ thống & Người dùng',
    parentKey: 'system:all',
    parentLabel: 'Toàn quyền Quản trị Hệ thống',
    children: [
      { key: 'admin:view', label: 'Xem trang Admin Dashboard' },
      { key: 'users:view', label: 'Xem danh sách Tài khoản' },
      { key: 'users:manage', label: 'Can thiệp Tài khoản (Thêm/Sửa/Xóa)' },
    ]
  },
  {
    key: 'metadata',
    label: 'Danh mục Cấu hình',
    parentKey: 'metadata:all',
    parentLabel: 'Toàn quyền Cấu hình Danh mục',
    children: [
      { key: 'linen:view', label: 'Xem danh sách Loại vải' },
      { key: 'linen:manage', label: 'Can thiệp Loại vải (Thêm mới)' },
      { key: 'ward:view', label: 'Xem danh sách Khoa phòng' },
      { key: 'ward:manage', label: 'Can thiệp Khoa phòng (Thêm/QR)' },
      { key: 'staff:view', label: 'Xem danh sách Hộ lý' },
      { key: 'staff:manage', label: 'Can thiệp Hộ lý (Thêm/Sửa/Xóa)' },
    ]
  },
  {
    key: 'inventory',
    label: 'Quản lý Kho đồ vải',
    parentKey: 'inventory:all',
    parentLabel: 'Toàn quyền Quản lý Kho',
    children: [
      { key: 'inventory:view', label: 'Xem số liệu tồn kho & biến động' },
      { key: 'inventory:import', label: 'Nhập lô hàng mới' },
      { key: 'inventory:circulate', label: 'Đưa đồ vải sạch vào sử dụng' },
      { key: 'inventory:discard', label: 'Báo hỏng đồ vải / đề xuất tái chế' },
      { key: 'inventory:min_stock', label: 'Sửa định mức tồn tối thiểu' },
    ]
  },
  {
    key: 'dispatch',
    label: 'Giám sát & Cấp phát',
    parentKey: 'dispatch:all',
    parentLabel: 'Toàn quyền Giám sát & Cấp phát',
    children: [
      { key: 'dispatch:view', label: 'Xem yêu cầu cấp phát & lịch sử khoa' },
      { key: 'dispatch:manage', label: 'Can thiệp cấp phát (Duyệt/Phân công/Xác nhận)' },
    ]
  },
  {
    key: 'laundry',
    label: 'Nghiệp vụ Nhà giặt',
    parentKey: 'laundry:all',
    parentLabel: 'Toàn quyền Nghiệp vụ Nhà giặt',
    children: [
      { key: 'laundry:view', label: 'Truy cập giao diện Nhà giặt' },
      { key: 'laundry:manage', label: 'Can thiệp nghiệp vụ Nhà giặt (Quét mã/Phân loại)' },
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

  // Backwards compatibility mappings for older permission keys
  if (userPerms.includes('admin:users') && (requiredPerm === 'users:view' || requiredPerm === 'users:manage')) return true
  if (userPerms.includes('admin:linen') && (requiredPerm === 'linen:view' || requiredPerm === 'linen:manage')) return true
  if (userPerms.includes('admin:ward') && (requiredPerm === 'ward:view' || requiredPerm === 'ward:manage')) return true
  if (userPerms.includes('admin:staff') && (requiredPerm === 'staff:view' || requiredPerm === 'staff:manage')) return true
  if (requiredPerm === 'dispatch:manage') {
    if (userPerms.includes('admin:ticket') || userPerms.includes('superior:cleaning')) return true
  }
  if (requiredPerm === 'dispatch:view') {
    if (userPerms.includes('supervisor:ward_history') || userPerms.includes('supervisor:laundry_aggregate')) return true
  }
  if (requiredPerm === 'laundry:view' && userPerms.includes('laundry:view')) return true
  if (requiredPerm === 'laundry:manage' && userPerms.includes('laundry:all')) return true
  
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

export function migratePermissions(perms: string[]): string[] {
  if (!perms || !Array.isArray(perms)) return []
  const newPerms = new Set<string>()
  for (const p of perms) {
    if (p === 'admin:batch') {
      newPerms.add('inventory:import')
      newPerms.add('inventory:circulate')
    } else if (p === 'supervisor:laundry_damage') {
      newPerms.add('inventory:discard')
    } else if (p === 'inventory:min_stock') {
      newPerms.add('inventory:min_stock')
    } else if (p === 'supervisor:laundry_procure') {
      newPerms.add('inventory:import')
      newPerms.add('inventory:min_stock')
    } else if (p === 'inventory:view_stock') {
      newPerms.add('inventory:view')
    } else if (p === 'inventory:manage') {
      newPerms.add('inventory:import')
      newPerms.add('inventory:circulate')
      newPerms.add('inventory:discard')
      newPerms.add('inventory:min_stock')
    } else if (p === 'admin:users') {
      newPerms.add('users:view')
      newPerms.add('users:manage')
    } else if (p === 'admin:linen') {
      newPerms.add('linen:view')
      newPerms.add('linen:manage')
    } else if (p === 'admin:ward') {
      newPerms.add('ward:view')
      newPerms.add('ward:manage')
    } else if (p === 'admin:staff') {
      newPerms.add('staff:view')
      newPerms.add('staff:manage')
    } else if (p === 'laundry:all') {
      newPerms.add('laundry:view')
      newPerms.add('laundry:manage')
    } else if (p === 'admin:ticket' || p === 'superior:cleaning') {
      newPerms.add('dispatch:manage')
    } else if (p === 'supervisor:ward_history' || p === 'supervisor:laundry_aggregate') {
      newPerms.add('dispatch:view')
    } else {
      newPerms.add(p)
    }
  }
  return Array.from(newPerms)
}
