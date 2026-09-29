// Public labels must not be persisted: PostgreSQL uses these stable enum-like codes.
export function submissionType(label: string): 'ROBOT' | 'COMPANY' | 'UPDATE' | null {
  switch (label) {
    case 'Add Robot': return 'ROBOT'
    case 'Add Company': return 'COMPANY'
    case 'Submit Update': return 'UPDATE'
    default: return null
  }
}
