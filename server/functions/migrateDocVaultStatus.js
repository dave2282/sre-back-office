// Ported from base44/functions/migrateDocVaultStatus/entry.ts

export default async (req, base44) => {
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all transactions that don't have doc_vault_status set yet
  const transactions = await base44.asServiceRole.entities.Transaction.list('-created_date', 2000);
  const needsMigration = (transactions || []).filter(t => !t.doc_vault_status);

  if (needsMigration.length === 0) {
    return Response.json({ migrated: 0, message: 'Nothing to migrate' });
  }

  // For each transaction needing migration, find its docs and use the first doc's status
  let migrated = 0;
  for (const txn of needsMigration) {
    const docs = await base44.asServiceRole.entities.Document.filter({ transaction_id: txn.id }, '-created_date', 1);
    const docStatus = docs?.[0]?.status;
    // Only set a non-default status if a meaningful one was found
    const validStatuses = ['in_progress', 'under_review', 'missing_docs', 'completed'];
    const vaultStatus = validStatuses.includes(docStatus) ? docStatus : 'in_progress';
    await base44.asServiceRole.entities.Transaction.update(txn.id, { doc_vault_status: vaultStatus });
    migrated++;
  }

  return Response.json({ migrated, message: `Migrated ${migrated} transactions` });
};
