# Rollback and Recovery

- Repo updater safety tags are the primary snapshot rollback.
- Pause preserves current state and evidence.
- Emergency Stop blocks writer workflows.
- Revert the last autonomous commit for a bad release; do not rerun generation until the cause is identified.
- Distribution failures do not require regenerating content. Retry only distribution.
- Provider degradation is non-destructive and must not be reported as success.
