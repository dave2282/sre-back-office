// Ported from base44/functions/smartScanAndSave/entry.ts

export default async (req, base44) => {
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { file_urls, transaction, transaction_id, required_docs, file_type_name, existing_doc_names } = await req.json();

  if (!file_urls?.length) return Response.json({ error: 'file_urls required' }, { status: 400 });

  const address = transaction?.property_address || 'Unknown Address';
  const agentName = transaction?.agent_name || transaction?.agent_email || user.full_name || 'Agent';
  const today = new Date().toISOString().split('T')[0];

  // Return immediately to prevent timeout
  setTimeout(() => {
    processInBackground();
  }, 100);

  return Response.json({ 
    success: true, 
    message: 'Files queued for processing. You will receive an email when complete.' 
  });

  // Background processing function
  async function processInBackground() {
    try {
      const requiredDocsList = (required_docs || []).join(', ');
      const existingNames = new Set((existing_doc_names || []).map(n => n.toLowerCase()));
      const allDetected = [];

      for (const file_url of file_urls) {
        const prompt = `You are quickly scanning a real estate PDF package to identify documents by their headers and titles only — do NOT read full content.

Transaction: ${address} | Agent: ${agentName} | Date: ${today}
Required checklist: ${requiredDocsList || 'Not specified'}

Instructions (fast scan only):
1. Scan ONLY page headers, titles, and the first 2-3 lines of each section to identify distinct documents.
2. Verify that the property address visible in the document matches or is related to: "${address}" — note any mismatch in the notes field.
3. For each document found, return:
   - "doc_title": title found in the header/top of the section
   - "filename": "${address} - [DocTitle] - ${agentName} - ${today}"
   - "category": one of [purchase_agreement, counter_proposal, addendum, commission_agreement, id_verification, other]
   - "page_start": starting page number (1-indexed) where this document begins
   - "page_end": ending page number (1-indexed) where this document ends
   - "checklist_match": use SEMANTIC and FUZZY matching to find the best matching checklist item — ignore parenthetical qualifiers like "(If Applicable)", "(If Built Prior 1978)", "(If Required)" when comparing. Match by MEANING not exact wording. Examples: "Lead-Based Paint Disclosure" matches "Lead Based Paint (If Built Prior 1978)", "Contract to Buy and Sell" matches "Purchase Agreement", "Earnest Money Receipt" matches "Earnest Money". Be VERY generous — return the exact checklist string if any reasonable match exists, or null if none.
   - "notes": one short sentence — flag address mismatches if any

Return ONLY a JSON object with a "documents" array. Do not read full document body text.`;

        let result;
        try {
          result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            file_urls: [file_url],
            response_json_schema: {
              type: 'object',
              properties: {
                documents: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      doc_title: { type: 'string' },
                      filename: { type: 'string' },
                      category: { type: 'string' },
                      checklist_match: { type: ['string', 'null'] },
                      notes: { type: 'string' }
                    }
                  }
                }
              }
            }
          });
        } catch (scanErr) {
          console.error(`Scan failed for file: ${file_url}`, scanErr.message);
          // Save the raw file as-is so it's not lost
          await base44.asServiceRole.entities.Document.create({
            name: `${address} - Uploaded Document - ${agentName} - ${today}`,
            file_url,
            file_type: 'application/pdf',
            category: 'other',
            notes: `AI scan failed: ${scanErr.message}. File saved for manual review.`,
            doc_section: 'transaction',
            transaction_id,
            agent_email: transaction?.agent_email || user.email,
            file_type_name: file_type_name || transaction?.file_type_name || '',
            transaction_type: transaction?.working_with?.toLowerCase() || '',
            file_status: 'pending',
          });
          continue;
        }

        const detected = result?.documents || [];
        // Note: page_start and page_end are returned by LLM to identify document boundaries
        // System will store individual file references instead of bulk file for each document
        detected.forEach(d => allDetected.push({ ...d, file_url }));
      }

      // Deduplicate within scan results — use doc_title as key since filenames may vary
      const seen = new Set();
      const deduped = allDetected.filter(det => {
        const key = `${det.doc_title || ''}|${det.file_url || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Skip docs that already exist
      const toUpload = deduped.filter(det => !existingNames.has(det.filename?.toLowerCase()));
      const skipped = deduped.length - toUpload.length;

      // Group documents by source file URL to avoid duplicating bulk PDFs
      const docsByFile = {};
      toUpload.forEach(doc => {
        if (!docsByFile[doc.file_url]) docsByFile[doc.file_url] = [];
        docsByFile[doc.file_url].push(doc);
      });

      // Save documents to Document Vault
      const allCreates = [];
      for (const [sourceFileUrl, docs] of Object.entries(docsByFile)) {
        // If multiple documents from same bulk file, only save first one fully
        // Others reference the same file but with page range metadata
        docs.forEach((doc, idx) => {
          const pageRangeNote = doc.page_start && doc.page_end 
            ? `[Pages ${doc.page_start}-${doc.page_end}] ` 
            : '';
          allCreates.push(
            base44.asServiceRole.entities.Document.create({
              name: doc.filename,
              file_url: sourceFileUrl,
              file_type: 'application/pdf',
              category: doc.category || 'other',
              notes: `${pageRangeNote}${doc.checklist_match ? `[Checklist: ${doc.checklist_match}] ` : ''}${doc.notes || ''}`.trim(),
              doc_section: 'transaction',
              transaction_id,
              agent_email: transaction?.agent_email || user.email,
              file_type_name: file_type_name || transaction?.file_type_name || '',
              transaction_type: transaction?.working_with?.toLowerCase() || '',
              file_status: 'pending',
            })
          );
        });
      }
      await Promise.all(allCreates);

      // Send completion email
      const docListHtml = toUpload.map(d =>
        `<li style="margin-bottom:6px;"><strong>${d.filename}</strong>${d.checklist_match ? ` <span style="color:#7c3aed">→ Matched: ${d.checklist_match}</span>` : ''}${d.notes ? `<br/><span style="color:#6b7280;font-size:12px;">${d.notes}</span>` : ''}</li>`
      ).join('');

      const emailBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#1e3a5f;">✅ Smart Scan Complete</h2>
  <p style="color:#444;">Hi ${user.full_name || 'there'},</p>
  <p style="color:#444;">Your document package for <strong>${address}</strong> has been processed and saved to the Document Vault.</p>
  <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:20px 0;border-radius:4px;">
    <p style="margin:0 0 4px;font-weight:bold;color:#166534;">${toUpload.length} document${toUpload.length !== 1 ? 's' : ''} uploaded successfully${skipped > 0 ? ` · ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped` : ''}</p>
  </div>
  ${toUpload.length > 0 ? `<ul style="color:#444;padding-left:20px;">${docListHtml}</ul>` : ''}
  <p style="color:#6b7280;font-size:13px;margin-top:20px;">You can view and manage your documents in the <strong>Document Vault</strong>.</p>
</div>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: `Smart Scan Complete — ${address}`,
        body: emailBody,
      });

    } catch (error) {
      console.error('Background processing failed:', error.message);
      // Send failure email
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: user.email,
        subject: `Smart Scan Failed — ${address}`,
        body: `<p style="font-family:Arial,sans-serif;">Hi ${user.full_name || 'there'},</p><p>Unfortunately, the Smart Scan for <strong>${address}</strong> failed to process: <em>${error.message}</em></p><p>Please try again from the Document Vault.</p>`,
      }).catch(() => {});
    }
  }
};
