// Ported from base44/functions/autoAuditDocument/entry.ts

export default async (req, base44) => {
  
  const payload = await req.json();
  const { event, data } = payload;

  // Only audit on create events
  if (event.type !== 'create') {
    return Response.json({ skipped: true });
  }

  const doc = data;
  if (doc.doc_section !== 'transaction' || !doc.transaction_id) {
    return Response.json({ skipped: true, reason: 'Not a transaction document' });
  }

  try {
    const transaction = await base44.asServiceRole.entities.Transaction.get(doc.transaction_id);
    if (!transaction) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const settings = (await base44.asServiceRole.entities.BrokerageSettings.list())?.[0];
    const fileTypeName = transaction.file_type_name;
    
    let requiredDocs = [];
    if (fileTypeName && settings?.document_file_types) {
      const fileType = settings.document_file_types.find(ft => ft.name === fileTypeName);
      requiredDocs = fileType?.required_docs || [];
    }

    if (requiredDocs.length === 0) {
      return Response.json({ skipped: true, reason: 'No required docs defined' });
    }

    // Get all documents for this transaction
    const transactionDocs = await base44.asServiceRole.entities.Document.filter({ transaction_id: doc.transaction_id }, '-created_date', 500);
    const checklistItems = requiredDocs;

    // Run AI matching
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are auditing a real estate transaction document. Match this document to the best matching checklist item using SEMANTIC matching.

DOCUMENT NAME: "${doc.name}"
DOCUMENT CATEGORY: "${doc.category || 'other'}"

CHECKLIST ITEMS:
${checklistItems.map((c, i) => `${i + 1}. ${c}`).join('\n')}

MATCHING RULES:
- Match by MEANING, not exact wording
- Examples: "Lead-Based Paint Disclosure" matches "Lead Based Paint (If Built Prior 1978)"
- "Purchase Agreement" matches "Contract to Buy and Sell"
- Be VERY generous — if document is clearly the same type, match it
- Return the EXACT checklist string if any reasonable match exists, or null if none

Return JSON with single property "matched_to": string or null`,
      file_urls: [doc.file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          matched_to: { type: ['string', 'null'] }
        }
      }
    });

    const matchedItem = result?.matched_to;
    if (matchedItem) {
      // Update document with AI approval and matched checklist item
      await base44.asServiceRole.entities.Document.update(doc.id, {
        file_status: 'ai_approved',
        name: matchedItem
      });

      return Response.json({ 
        success: true, 
        matched_to: matchedItem,
        document_id: doc.id
      });
    }

    return Response.json({ 
      success: true, 
      matched_to: null,
      document_id: doc.id
    });
  } catch (error) {
    console.error('Auto-audit failed:', error.message);
    return Response.json({ 
      success: false, 
      error: error.message,
      document_id: doc.id
    });
  }
};
