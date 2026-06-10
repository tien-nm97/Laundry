# becamex-style-laundry-design

## Goal Description
Redesign the Hospital Linen Management & Distribution System UI to match the Becamex Operations system's light theme, typography, and split-screen layouts. Additionally, introduce a public, passwordless daily dispatch view (`/laundry/dispatch`) where the laundry team can view a summed preparation list and deliver pending ward requests with a single click.

---

## Proposed Changes

### 🛡️ Authentication & Routing
#### [MODIFY] [middleware.ts](file:///d:/OneDrive/desktop/Laundry/src/middleware.ts)
- Exclude `/laundry/dispatch` from the `/laundry/*` route protection.
- Ensure public access to the dispatch page without needing a logged-in token.

### 🔌 Dispatch API
#### [NEW] [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/dispatch/tickets/route.ts)
- `GET`: Fetch all pending tickets (`status = 'PENDING'`), including items and ward details, for public use.
- `PUT`: Update a ticket status to `DELIVERED` given its `ticketId`.

### 🧺 Laundry Operations & Daily Dispatch Views
#### [NEW] [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/laundry/dispatch/page.tsx)
- Public passwordless view for daily preparation and delivery.
- Split-screen layout:
  - **Left side (30% width)**: Summed preparation list (total required quantities grouped by linen type).
  - **Right side (70% width)**: Pending ward request tickets list with a large "Đã giao" button.

#### [MODIFY] [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/laundry/page.tsx)
- Redesign with Becamex light theme (background `#f3f6f9`, panels white, text dark slate, buttons blue `#0066b2`, active tabs `#1e293b` with white text).
- Re-layout tabs using split-screen patterns:
  - **Bàn giao**: Left column ticket selection list, Right column ticket details & deliver button.
  - **Khai thác**: Left column imported batches, Right column extraction form & history.
  - **Báo hỏng**: Left column active circulations, Right column discard form & history.
  - **Báo cáo**: Left column batches, Right column average lifespan metrics.

### 🛡️ Admin & Authentication Pages Redesigns
#### [MODIFY] [layout.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/layout.tsx)
- Switch to light theme, Becamex branding header, capsule tabs.

#### [MODIFY] [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx)
- Switch to light theme becamex card layouts.

#### [MODIFY] [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/batches/page.tsx)
- Switch to light theme becamex card layouts.

#### [MODIFY] [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/login/page.tsx)
- Redesign login panel as a Becamex light theme card.

#### [MODIFY] [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/request/order/page.tsx)
- Redesign ward request portal in matching light theme becamex card aesthetics.

---

## Verification Plan

### Automated Tests
- Create `src/__tests__/dispatch-api.test.ts` to verify the public tickets dispatch API (GET and PUT).
- Update existing test files if any CSS class or path assertions are impacted.
- Run all tests: `npm test`
- Build check: `npm run build`

### Manual Verification
1. Access `/laundry/dispatch` without logging in to see the split-screen dispatch layout.
2. Submit a request from `/request/order?wardId=xxx&token=yyy` and verify it updates the public dispatch summary on the left and adds a ticket on the right.
3. Click "Đã giao" and verify the ticket is fulfilled and the summary is decremented.
