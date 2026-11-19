// Calculate similarity between two strings (0-1 scale)
export const stringSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  // Extract significant words (>2 chars)
  const words1 = s1.split(/\s+|[,\-()]/).filter(w => w.length > 2);
  const words2 = s2.split(/\s+|[,\-()]/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Count matching words
  const matches = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2))).length;
  return matches / Math.max(words1.length, words2.length);
};

// Normalize synonyms (borrower=buyer, owner=seller, etc)
const normalizeSynonyms = (str) => {
  return str
    .replace(/\bestimated\s+borrower's?\s+statement\b/gi, 'final settlement statement')
    .replace(/\bborrower\b/gi, 'buyer')
    .replace(/\bowner\b/gi, 'seller')
    .replace(/\bloan\b/gi, 'mortgage');
};

// Check if document matches criteria (title, address, names at 75% threshold)
export const evaluateDocumentMatch = (doc, requiredItem, propertyAddress, documentNames = []) => {
  const THRESHOLD = 0.75;
  const results = {
    titleMatch: false,
    addressMatch: false,
    namesMatch: false,
    passCount: 0,
    totalCriteria: 0,
  };

  // Criterion 1: Title matching (with synonym normalization)
  const normalizedFilename = normalizeSynonyms(doc.filename);
  const normalizedRequired = normalizeSynonyms(requiredItem);
  const titleSim = stringSimilarity(normalizedFilename, normalizedRequired);
  results.titleMatch = titleSim >= THRESHOLD;
  if (results.titleMatch) results.passCount++;
  results.totalCriteria++;

  // Criterion 2: Address matching (only if document has address info)
  if (doc.property_address_in_doc) {
    const addressSim = stringSimilarity(doc.property_address_in_doc, propertyAddress);
    results.addressMatch = addressSim >= THRESHOLD;
    if (results.addressMatch) results.passCount++;
    results.totalCriteria++;
  }

  // Criterion 3: Names matching (only if document has names)
  if (documentNames && documentNames.length > 0) {
    const nameMatches = documentNames.filter(docName =>
      stringSimilarity(docName, requiredItem) >= 0.6 // Slightly lower for partial name matching
    ).length;
    results.namesMatch = nameMatches > 0;
    if (results.namesMatch) results.passCount++;
    results.totalCriteria++;
  }

  // Must pass at least 2 out of criteria (or 1 if only title is available)
  const passed = results.passCount >= Math.max(2, results.totalCriteria - 1);
  return { ...results, passed };
};