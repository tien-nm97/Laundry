# Ward Request Redesign Spec

## Goal Description
Redesign the Ward Request Portal (`/request/order`) to allow passwordless mobile-friendly linen requests based on location-specific QR codes, without requiring login. The portal will support:
1. **Requester Staff Dropdown**: Loaded from a new database table `Orderly` (general hospital orderlies).
2. **Orderly Database Management**: An orderly management CRUD section added to the `/admin` portal so administrators can add and remove employee names.
3. **Dynamic Row-Adding Form Layout**: A table/list of row inputs where users select a linen type and quantity, with a circular `+` (or `⊕`) button to append a new blank row of inputs, and a delete `×` button on each row to remove it.

---

## 1. Data Model Changes

### Prisma Schema Updates (`prisma/schema.prisma`)
Add a new model `Orderly` to store hospital ward staff, and update `Ticket` to track the orderly name (either as a relation to `Orderly` or a string tracking `requesterName` for long-term historical records).
To keep history resilient even if an orderly is deleted from the active list, we will store the requester's name as a string `requesterName` in the `Ticket` model.

```prisma
model Orderly {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
}

model Ticket {
  id            String       @id @default(uuid())
  wardId        String
  ward          Ward         @relation(fields: [wardId], references: [id])
  status        TicketStatus @default(PENDING)
  requesterName String
  deliveryDate  DateTime
  createdAt     DateTime     @default(now())
  items         TicketItem[]
}
```

---

## 2. API Endpoint Changes

### Admin Orderlies API (`/api/admin/orderlies`)
- `GET`: Retrieve list of all orderlies ordered alphabetically by name.
- `POST`: Create a new orderly with a given `name`.
- `DELETE`: Remove an orderly by `id` (using query param or request body).

### Ward Request Details API (`/api/request/order`)
- `GET`: Return the validated `ward` name, active `linenTypes`, and the list of active `orderlies` for the dropdown.
- `POST`: Create a ticket. Accept `wardId`, `token`, `requesterName` (string), and `items` (array of `linenTypeId` and `quantity`). Validate that `requesterName` is present and items are non-empty and have valid quantities.

---

## 3. Frontend Redesigns

### Admin Portal Redesign (`/admin`)
Add a third card/tab layout section to manage employees:
- **Quản lý Hộ lý (Orderly Management)**:
  - Input field to create a new orderly name.
  - A table list displaying all seeded/created orderlies.
  - A "Xóa" button to delete an orderly from the active database table.

### Ward Request Portal (`/request/order/page.tsx`)
- Display the header `Yêu cầu Đồ vải Hàng ngày` and the auto-filled `Ward` name.
- **Requester Selection**: A select dropdown labeled `Nhân viên yêu cầu (Hộ lý)` showing list of orderlies.
- **Dynamic Rows List**:
  - The form renders an array of row objects: `{ linenTypeId: string, quantity: number }[]`.
  - Initial state: One blank row.
  - Each row displays:
    - A select dropdown populated with available linen types (disabling already selected ones is a nice touch, but simple select is fine).
    - A number input field for quantity.
    - Action buttons:
      - A red `×` button to delete the row (visible only if there is more than 1 row).
  - A large `+ Thêm loại đồ vải` button or a `+` icon after the last row to append a new blank row `{ linenTypeId: '', quantity: 1 }` to the state.
- **Submission**: Clicking "Gửi phiếu yêu cầu" validates that a requester is selected, all rows have a selected linen type and positive quantity, and sends the payload to `/api/request/order`.

---

## 4. Verification & Testing

### Automated Tests
- Create `src/__tests__/orderlies-api.test.ts` to verify GET, POST, and DELETE endpoints for orderly management.
- Update `src/__tests__/request.test.ts` to include the `requesterName` field during ticket submission.
- Update frontend UI tests to accommodate the dynamic rows and dropdown selections.
