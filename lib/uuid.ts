const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

// document ids arrive in the request body and are passed to a search function that casts
// them to uuid[]. anything else makes Postgres raise, which the caller used to swallow and
// report as "no relevant documents found", so they are checked before they get that far.
export function isUuidList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isUuid)
}
