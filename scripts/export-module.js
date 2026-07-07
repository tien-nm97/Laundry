const fs = require('fs')
const path = require('path')

const sourceDir = path.join(__dirname, '..')
const exportDir = path.join(sourceDir, 'laundry-module-export')

// Ensure directory exists helper
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// Copy file and apply string replacements
function copyAndTransform(src, dest, transforms = []) {
  if (!fs.existsSync(src)) {
    console.warn(`Source file not found: ${src}`)
    return
  }
  ensureDir(path.dirname(dest))
  let content = fs.readFileSync(src, 'utf8')
  
  for (const t of transforms) {
    content = content.replace(t.search, t.replace)
  }
  
  fs.writeFileSync(dest, content, 'utf8')
  console.log(`Exported: ${path.relative(exportDir, dest)}`)
}

// Copy directory recursively and transform TS/TSX files
function copyDirAndTransform(srcDir, destDir, transforms = []) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`Source directory not found: ${srcDir}`)
    return
  }
  
  ensureDir(destDir)
  const items = fs.readdirSync(srcDir)
  
  for (const item of items) {
    const srcPath = path.join(srcDir, item)
    const destPath = path.join(destDir, item)
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirAndTransform(srcPath, destPath, transforms)
    } else {
      if (item.endsWith('.ts') || item.endsWith('.tsx')) {
        copyAndTransform(srcPath, destPath, transforms)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}

console.log('Starting Laundry module export process...')

// 1. Recreate clean export folder
if (fs.existsSync(exportDir)) {
  fs.rmSync(exportDir, { recursive: true, force: true })
}
ensureDir(exportDir)

// Common replacements for files
const apiTransforms = [
  {
    search: /import\s+\{\s*verifyPermission\s*\}\s+from\s+['"]@\/lib\/jwt['"]/g,
    replace: "import { verifyLaundrySession as verifyPermission } from '@/lib/services/laundry-session'"
  },
  {
    search: /import\s+\{\s*verifyLaundryRequest\s*\}\s+from\s+['"]@\/lib\/jwt['"]/g,
    replace: "import { verifyLaundrySession as verifyLaundryRequest } from '@/lib/services/laundry-session'"
  },
  {
    search: /import\s+\{\s*verifyAdminRequest\s*\}\s+from\s+['"]@\/lib\/jwt['"]/g,
    replace: "import { verifyLaundrySession as verifyAdminRequest } from '@/lib/services/laundry-session'"
  },
  {
    search: /import\s+\{\s*verifyToken\s*\}\s+from\s+['"]@\/lib\/jwt['"]/g,
    replace: "import { verifyLaundrySession as verifyToken } from '@/lib/services/laundry-session'"
  },
  {
    search: /import\s+\{\s*hasPermission\s*\}\s+from\s+['"]@\/lib\/permissions['"]/g,
    replace: "import { hasLaundryPermission as hasPermission } from '@/lib/services/laundry-auth'"
  }
]

const uiTransforms = [
  {
    search: /import\s+\{\s*hasPermission\s*\}\s+from\s+['"]@\/lib\/permissions['"]/g,
    replace: "import { hasLaundryPermission as hasPermission } from '@/lib/services/laundry-auth'"
  },
  {
    search: /import\s+\{\s*hasPermission\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/permissions['"]/g,
    replace: "import { hasLaundryPermission as hasPermission } from '@/lib/services/laundry-auth'"
  }
]

// 2. Export helpers
ensureDir(path.join(exportDir, 'lib/services'))
fs.copyFileSync(
  path.join(sourceDir, 'src/lib/laundry-auth.ts'),
  path.join(exportDir, 'lib/services/laundry-auth.ts')
)

// Write laundry-session.ts
const sessionHelperContent = `import { getServerSession } from "next-auth/next"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { hasLaundryPermission } from "./laundry-auth"

/**
 * Cầu nối xác thực session NextAuth thay thế cho JWT Token cookie cũ.
 * Trả về cấu trúc giống hệt verifyPermission ban đầu để giảm thiểu sửa đổi code API.
 */
export async function verifyLaundrySession(request: Request, permission: string) {
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user) {
    return { error: 'Chưa đăng nhập', status: 401 }
  }

  const payload = session.user
  
  // ADMIN mặc định thông qua
  if (payload.role === 'ADMIN') {
    return { payload }
  }

  // Nếu permission là 'laundry:view' hoặc tương tự, kiểm tra trong mảng ảo
  if (!hasLaundryPermission(payload.permissions, permission)) {
    return { error: 'Không có quyền thực hiện thao tác này', status: 403 }
  }

  return { payload }
}
`
fs.writeFileSync(path.join(exportDir, 'lib/services/laundry-session.ts'), sessionHelperContent, 'utf8')

// 3. Export Frontend Pages
copyAndTransform(
  path.join(sourceDir, 'src/app/admin/inventory/page.tsx'),
  path.join(exportDir, 'app/dashboard/laundry/inventory/page.tsx'),
  uiTransforms
)
copyAndTransform(
  path.join(sourceDir, 'src/app/admin/dispatch/page.tsx'),
  path.join(exportDir, 'app/dashboard/laundry/dispatch/page.tsx'),
  uiTransforms
)
copyAndTransform(
  path.join(sourceDir, 'src/app/laundry/page.tsx'),
  path.join(exportDir, 'app/dashboard/laundry/operation/page.tsx'),
  uiTransforms
)
copyAndTransform(
  path.join(sourceDir, 'src/app/request/order/page.tsx'),
  path.join(exportDir, 'app/dashboard/laundry/request/page.tsx'),
  uiTransforms
)

// 4. Export Backend API Routes
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/admin/inventory'),
  path.join(exportDir, 'app/api/laundry/inventory'),
  apiTransforms
)
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/admin/linen-types'),
  path.join(exportDir, 'app/api/laundry/linen-types'),
  apiTransforms
)
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/admin/wards'),
  path.join(exportDir, 'app/api/laundry/wards'),
  apiTransforms
)
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/admin/tickets'),
  path.join(exportDir, 'app/api/laundry/tickets'),
  apiTransforms
)
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/laundry'),
  path.join(exportDir, 'app/api/laundry/operation'),
  apiTransforms
)
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/request'),
  path.join(exportDir, 'app/api/laundry/request'),
  apiTransforms
)
copyDirAndTransform(
  path.join(sourceDir, 'src/app/api/dispatch'),
  path.join(exportDir, 'app/api/laundry/dispatch'),
  apiTransforms
)

console.log('Laundry module exported successfully!')
