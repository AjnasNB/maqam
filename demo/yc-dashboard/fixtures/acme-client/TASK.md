# Acme Jobs v2 migration

Migrate `createJob` from `POST /v1/jobs` to `POST /v2/tasks`.

- Wrap the payload as `{ "task": payload }`.
- Keep bearer authorization.
- Retry one server failure.
- Reuse the same `Idempotency-Key` for the same logical task.
- Pass `npm test`.
- Do not write without an exact one-use approval.
