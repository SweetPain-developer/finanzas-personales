# Design: Create Account Feature

## Technical Approach

The implementation will introduce a new client-side component, `AccountEditor.tsx`, responsible for capturing new account details. This component will be conditionally rendered within `AccountsPage.tsx`. A new state flag will manage the view toggle between the account list and the editor form. Upon submission, the form will call a new backend endpoint, `POST /api/accounts`, which will be responsible for validating the input and persisting the new account to the database using Prisma.

## Architecture Decisions

### Decision: Client-Side View Toggling
**Choice**: Use a simple `useState` hook (`isCreating`) in `AccountsPage.tsx` to toggle between the list of accounts and the `AccountEditor` form.
**Alternatives considered**:
1.  **Modal Dialog**: Display the form in a modal. This adds complexity with overlay management and is less integrated with the page flow.
2.  **Separate Route**: Navigate to a new route like `/accounts/new`. This is overkill for a simple creation form and requires more complex routing setup.
**Rationale**: The `useState` approach is the most straightforward and lightweight solution. It keeps the feature contained within the existing page, providing a seamless user experience for a simple task, which aligns with the patterns seen in other parts of the application.

### Decision: Backend Service Logic
**Choice**: Create a new file `apps/api/src/accounts/createAccount.ts` to encapsulate the business logic for account creation.
**Alternatives considered**: Placing the logic directly inside the route handler in `app.ts`.
**Rationale**: The existing backend code separates route definitions in `app.ts` from business logic (e.g., `getAccounts.ts`, `createCommitment.ts`). Following this established pattern improves modularity and maintainability.

### Decision: Payload Validation
**Choice**: Implement manual validation within the `createAccount` service function.
**Alternatives considered**: Using a validation library like Zod.
**Rationale**: The application does not currently use a validation library. Introducing one for a single endpoint would be inconsistent. The existing pattern is to use custom validation functions and error classes, which is sufficient for the simple payload of this feature.

## Data Flow

```
User clicks "+" button
      │
      v
[AccountsPage.tsx] sets `isCreating` to true
      │
      v
Renders <AccountEditor onSave={...} onCancel={...} />
      │
      ├───── User fills form and clicks "Save" ─────┐
      │                                             │
      v                                             v
`onSave` handler POSTs to /api/accounts      [AccountEditor.tsx]
      │                                             ^
      v                                             │
[/api/accounts @ app.ts] ◄─── Express Route         │
      │                                             │
      v                                             │
[createAccount.ts] ◄─── Controller/Service Logic    │
      │                                             │
      ├─ Validates payload (name, type, balance)    │
      │                                             │
      v                                             │
`prisma.account.create()` ◄─── Prisma Client        │
      │                                             │
      v                                             │
Returns new account object (201) ───-───-───-───-───-┘
      │
      v
[AccountsPage.tsx] `onSave` callback completes
      │
      ├─ Sets `isCreating` to false
      │
      v
Refreshes account list to show the new account
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/pages/AccountsPage.tsx` | Modify | Add state to toggle editor view, add a '+' button in the header, and conditionally render `<AccountEditor />`. |
| `apps/web/src/components/AccountEditor.tsx` | Create | New component with a form for name, type, and initial balance. Manages its own form state. |
| `apps/api/src/app.ts` | Modify | Add a new route `POST /api/accounts` to handle account creation. |
| `apps/api/src/accounts/createAccount.ts` | Create | New file to contain the logic for validating the request and creating an account using Prisma. |
| `packages/shared-types/src/index.ts` | Modify | Add `CreateAccountPayload` type for the new endpoint's request body. |

## Interfaces / Contracts

#### `packages/shared-types/src/index.ts`

```typescript
import type { Account, AccountType } from "@prisma/client";

// ... other exports

export type CreateAccountPayload = {
  nombre: string;
  tipo: AccountType;
  saldoInicial: number;
};
```

#### `apps/api/src/routes/accounts.ts` (Conceptual) -> `apps/api/src/app.ts`

**Endpoint**: `POST /api/accounts`
**Request Body**: `CreateAccountPayload`
**Success Response** (201 Created): `{ account: Account }`
**Error Response** (400 Bad Request): `{ error: "Error message" }`
**Error Response** (500 Internal Server Error): `{ error: "Internal server error" }`

#### `apps/web/src/components/AccountEditor.tsx`

**Props:**
```typescript
interface AccountEditorProps {
  onSave: (newAccount: Account) => void;
  onCancel: () => void;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `createAccount.ts` | Mock Prisma client. Test validation logic: valid payload, missing fields, invalid `AccountType`, non-numeric balance. Test successful creation call. |
| Unit | `AccountEditor.tsx` | Use React Testing Library to render the component. Simulate user input and form submission. Verify `onSave` and `onCancel` props are called with correct data. |
| Integration | `POST /api/accounts` | Use `supertest` to make requests to the running application. Test the full flow from request to database insertion. Check for correct status codes and response bodies. |
| E2E | Accounts Creation Flow | Use a tool like Playwright or Cypress to simulate a user clicking the '+' button, filling out the form, submitting it, and seeing the new account appear in the list. |

## Migration / Rollout

No migration required. This is a net-new feature.

## Open Questions

- [ ] None at this time. The design is straightforward and follows existing application patterns.
