// Ported from base44/functions/smartScanPDF/entry.ts
import { PDFDocument, degrees } from 'pdf-lib';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRateLimitError = (error) =>
  error.message?.includes('429') ||
  error.message?.includes('Rate limit') ||
  error.message?.includes('Too Many Requests');

const retryWithBackoff = async (fn, maxRetries = 5, baseDelay = 2000) => {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isRateLimitError(error)) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
        console.warn(`Rate limit hit, retry attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  throw lastError;
};

export default async (req, base44) => {
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, transaction_id, agent_email } = await req.json();

    if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

    // Fetch transaction if ID provided
    let txn = null;
    if (transaction_id) {
      try {
        txn = await base44.asServiceRole.entities.Transaction.get(transaction_id);
      } catch (e) {
        console.error('Transaction fetch failed:', e);
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const address = txn?.property_address || 'Unknown Address';
    const agentName = txn?.agent_name || 'Agent';

    // Step 1: Analyze PDF to identify documents and their content breaks
    const prompt = `You are scanning a real estate PDF package to identify distinct documents by their content, headers, and structure.

Transaction: ${address} | Agent: ${agentName} | Date: ${today}

For each document found, return:
- "doc_title": document title or name
- "category": one of [purchase_agreement, counter_proposal, addendum, commission_agreement, id_verification, other]
- "relative_position": approximate position (0.0 to 1.0) where this document starts in the PDF (0=beginning, 1=end)
- "notes": brief summary or key details

Analyze content structure and visual breaks to identify where each document begins and ends. Do NOT rely on page numbers shown in the document.

Return ONLY a JSON object with a "documents" array.`;

    const analysisResult = await retryWithBackoff(() => base44.asServiceRole.integrations.Core.InvokeLLM({
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
                category: { type: 'string' },
                relative_position: { type: 'number' },
                notes: { type: 'string' }
              }
            }
          }
        }
      }
    }));

    const documents = analysisResult?.documents || [];
    console.log(`LLM identified ${documents.length} documents:`, JSON.stringify(documents, null, 2));
    
    if (!documents || documents.length === 0) {
      console.warn('No documents detected by LLM analysis');
      return Response.json({ success: false, error: 'No documents detected in PDF' }, { status: 400 });
    }

    // Step 2: Download the bulk PDF — wait briefly after LLM call to avoid rate limits
    await sleep(3000);
    const pdfResponse = await retryWithBackoff(async () => {
      const res = await fetch(file_url);
      if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.statusText}`);
      return res;
    });
    const pdfBytes = await pdfResponse.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBytes);

    // Step 3: Extract pages for each document and create new PDFs
    const createdDocs = [];

    for (let i = 0; i < documents.length; i++) {
      try {
        const doc = documents[i];
        const totalPages = sourcePdf.getPageCount();
        
        // Convert relative position to actual page indices
        const currentRelPos = Math.max(0, Math.min(1, doc.relative_position || (i / documents.length)));
        const nextDoc = documents[i + 1];
        const nextRelPos = nextDoc ? Math.max(0, Math.min(1, nextDoc.relative_position)) : 1.0;
        
        const pageStart = Math.max(0, Math.floor(currentRelPos * totalPages));
        let pageEnd = Math.max(pageStart, Math.floor(nextRelPos * totalPages) - 1);
        if (pageEnd >= totalPages) pageEnd = totalPages - 1;
        
        console.log(`Processing "${doc.doc_title}": pages ${pageStart}-${pageEnd} (out of ${totalPages})`);

        if (pageStart > pageEnd || pageStart >= totalPages) {
          console.warn(`Invalid page range for "${doc.doc_title}": ${pageStart}-${pageEnd}`);
          continue;
        }

        // Create new PDF with only these pages
        const newPdf = await PDFDocument.create();
        const pageIndices = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i);
        console.log(`Copying pages: ${pageIndices.join(', ')}`);
        const pages = await newPdf.copyPages(sourcePdf, pageIndices);
        pages.forEach(page => newPdf.addPage(page));

        // Convert to bytes
        const newPdfBytes = await newPdf.save();
        console.log(`Created PDF for "${doc.doc_title}": ${newPdfBytes.length} bytes`);
        
        if (newPdfBytes.length === 0) {
          console.error(`PDF for "${doc.doc_title}" is empty`);
          continue;
        }

        // Upload new PDF with retry
        console.log(`Uploading PDF for "${doc.doc_title}"...`);
        const fileName = `${doc.doc_title || 'Document'}.pdf`;
        const file = new File([newPdfBytes], fileName, { type: 'application/pdf' });
        const { file_url: newFileUrl } = await retryWithBackoff(() => base44.asServiceRole.integrations.Core.UploadFile({
          file
        }));
        console.log(`Uploaded to: ${newFileUrl}`);
        
        // Throttle between uploads
        await sleep(500);

        // Create document record with retry
        console.log(`Creating document record for "${doc.doc_title}"...`);
        try {
          const docRecord = await retryWithBackoff(() => base44.asServiceRole.entities.Document.create({
            name: doc.doc_title || 'Document',
            file_url: newFileUrl,
            file_type: 'application/pdf',
            doc_section: 'transaction',
            transaction_id,
            agent_email: agent_email || txn?.agent_email || user.email,
            category: doc.category || 'other',
            notes: doc.notes || '',
            file_status: 'pending'
          }));
          console.log(`Created document: ${docRecord.id}`);
          createdDocs.push(docRecord);
        } catch (createErr) {
          console.error(`Failed to create document entity for "${doc.doc_title}":`, createErr.message);
        }
      } catch (docError) {
        console.error(`Failed to process document at index ${i}:`, docError.message);
        if (docError.stack) console.error(docError.stack);
      }
    }

    console.log(`Smart scan complete: ${createdDocs.length} documents created out of ${documents.length} detected`);

    // Also save the original unmodified package PDF as a document record
    // Only save if there were multiple documents detected (i.e. it was actually a package that got split)
    if (documents.length <= 1) {
      console.log('Single document detected — skipping original package save.');
    }
    let originalDocRecord = null;
    if (documents.length > 1) {
      try {
        const originalPackageName = `Original Package — ${address}`;
        originalDocRecord = await retryWithBackoff(() => base44.asServiceRole.entities.Document.create({
          name: originalPackageName,
          file_url: file_url,
          file_type: 'application/pdf',
          doc_section: 'transaction',
          transaction_id,
          agent_email: agent_email || txn?.agent_email || user.email,
          category: 'other',
          notes: 'Original unmodified package — uploaded in case documents were split incorrectly.',
          file_status: 'pending'
        }));
        console.log(`Saved original package as document: ${originalDocRecord.id}`);
      } catch (origErr) {
        console.error('Failed to save original package document:', origErr.message);
      }
    }

    if (createdDocs.length === 0) {
      console.warn('No documents were successfully created. Check LLM output and PDF extraction.');
      return Response.json({ 
        success: false, 
        error: 'Failed to create documents from PDF', 
        detectedCount: documents.length,
        createdCount: 0,
        originalSaved: !!originalDocRecord
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      documents: createdDocs,
      count: createdDocs.length,
      detectedCount: documents.length,
      originalSaved: !!originalDocRecord
    });
  } catch (error) {
    console.error('smartScanPDF error:', error.message);
    if (error.stack) console.error(error.stack);
    return Response.json({ error: error.message, type: error.constructor.name }, { status: 500 });
  }
};
