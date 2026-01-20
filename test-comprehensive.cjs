const { getAllCitationsFromLlmOutput } = require('./lib/index.cjs');

// Helper function to run a test
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    return false;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertContains(arr, item, msg = '') {
  if (!arr.includes(item)) {
    throw new Error(`${msg} Expected array to contain ${item}`);
  }
}

let passed = 0;
let failed = 0;

console.log('=== Non-self-closing citation tags ===\n');

if (test('multiple consecutive non-self-closing citations', () => {
  const input = `<cite attachment_id='file1' full_phrase='first' key_span='first' start_page_key='page_number_1_index_0' line_ids='1'>A</cite><cite attachment_id='file2' full_phrase='second' key_span='second' start_page_key='page_number_2_index_0' line_ids='2'>B</cite>`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 2, 'Should have 2 citations.');
  const keySpans = Object.values(result).map((c) => c.keySpan);
  assertContains(keySpans, 'first');
  assertContains(keySpans, 'second');
})) passed++; else failed++;

if (test('nested markdown inside citation content', () => {
  const input = `<cite attachment_id='test123' full_phrase='important fact' key_span='fact' start_page_key='page_number_1_index_0' line_ids='1'>

**Bold text** and *italic* and \`code\`

- List item 1
- List item 2
</cite>`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  assertEqual(Object.values(result)[0].fullPhrase, 'important fact');
})) passed++; else failed++;

console.log('\n=== Escaped quotes in attributes ===\n');

if (test('escaped single quotes in reasoning attribute', () => {
  const input = `<cite attachment_id='test123' reasoning='The patient\\'s condition improved' full_phrase='condition improved' key_span='improved' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.reasoning || !citation.reasoning.includes('patient')) {
    throw new Error('Reasoning should contain "patient"');
  }
})) passed++; else failed++;

if (test('escaped double quotes in full_phrase', () => {
  const input = `<cite attachment_id="test123" full_phrase="He said \\"hello\\" to everyone" key_span="hello" start_page_key="page_number_1_index_0" line_ids="1" />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
})) passed++; else failed++;

if (test('multiple escaped quotes in same attribute', () => {
  const input = `<cite attachment_id='test123' reasoning='The \\'first\\' and \\'second\\' items' full_phrase='first and second' key_span='first' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
})) passed++; else failed++;

console.log('\n=== Multiline full_phrase handling ===\n');

if (test('full_phrase with literal newlines', () => {
  const input = `<cite attachment_id='test123' full_phrase='Line one
Line two
Line three' key_span='Line two' start_page_key='page_number_1_index_0' line_ids='1-3' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.fullPhrase.includes('Line one') || !citation.fullPhrase.includes('Line two')) {
    throw new Error('Full phrase should contain both lines');
  }
})) passed++; else failed++;

if (test('full_phrase spanning multiple lines in non-self-closing tag', () => {
  const input = `<cite attachment_id='test123' full_phrase='First paragraph.

Second paragraph with more details.

Third paragraph concluding.' key_span='Second paragraph' start_page_key='page_number_1_index_0' line_ids='1-10'>Content here</cite>`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
})) passed++; else failed++;

console.log('\n=== Special characters in attributes ===\n');

if (test('angle brackets in full_phrase (HTML entities)', () => {
  const input = `<cite attachment_id='test123' full_phrase='The value was &lt;100 and &gt;50' key_span='100' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.fullPhrase.includes('<100') || !citation.fullPhrase.includes('>50')) {
    throw new Error('HTML entities should be decoded');
  }
})) passed++; else failed++;

if (test('ampersands in full_phrase', () => {
  const input = `<cite attachment_id='test123' full_phrase='Smith &amp; Jones LLC' key_span='Smith' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.fullPhrase.includes('&')) {
    throw new Error('Ampersand entity should be decoded');
  }
})) passed++; else failed++;

if (test('unicode characters in full_phrase', () => {
  const input = `<cite attachment_id='test123' full_phrase='Temperature: 98.6°F • Heart rate: 72 bpm' key_span='98.6°F' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.fullPhrase.includes('°') || !citation.fullPhrase.includes('•')) {
    throw new Error('Unicode characters should be preserved');
  }
})) passed++; else failed++;

if (test('forward slashes in attribute values', () => {
  const input = `<cite attachment_id='test123' full_phrase='Date: 01/15/2024' key_span='01/15/2024' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  assertEqual(Object.values(result)[0].fullPhrase, 'Date: 01/15/2024');
})) passed++; else failed++;

if (test('equals signs in attribute values', () => {
  const input = `<cite attachment_id='test123' full_phrase='Formula: E=mc²' key_span='E=mc²' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  if (!Object.values(result)[0].fullPhrase.includes('E=mc')) {
    throw new Error('Equals sign should be preserved');
  }
})) passed++; else failed++;

console.log('\n=== Mixed citation formats ===\n');

if (test('mix of self-closing and non-self-closing citations', () => {
  const input = `First: <cite attachment_id='file1' full_phrase='phrase one' key_span='one' start_page_key='page_number_1_index_0' line_ids='1' />
Second: <cite attachment_id='file2' full_phrase='phrase two' key_span='two' start_page_key='page_number_2_index_0' line_ids='2'>content</cite>
Third: <cite attachment_id='file3' full_phrase='phrase three' key_span='three' start_page_key='page_number_3_index_0' line_ids='3' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 3);
  const keySpans = Object.values(result).map((c) => c.keySpan);
  assertContains(keySpans, 'one');
  assertContains(keySpans, 'two');
  assertContains(keySpans, 'three');
})) passed++; else failed++;

if (test('citations with and without escaped underscores', () => {
  const input = `First: <cite attachment\\_id='file1' full\\_phrase='phrase one' key\\_span='one' start\\_page\\_key='page\\_number\\_1\\_index\\_0' line\\_ids='1' />
Second: <cite attachment_id='file2' full_phrase='phrase two' key_span='two' start_page_key='page_number_2_index_0' line_ids='2' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 2);
})) passed++; else failed++;

if (test('citations interspersed with markdown', () => {
  const input = `# Summary

The report shows **important findings**<cite attachment_id='file1' full_phrase='important findings in Q4' key_span='important findings' start_page_key='page_number_1_index_0' line_ids='1' />.

## Details

- Revenue increased by 15%<cite attachment_id='file2' full_phrase='revenue growth of 15 percent' key_span='15%' start_page_key='page_number_2_index_0' line_ids='5' />
- Costs decreased<cite attachment_id='file3' full_phrase='operational costs down' key_span='costs' start_page_key='page_number_3_index_0' line_ids='10' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 3);
})) passed++; else failed++;

console.log('\n=== Edge cases with incomplete/malformed citations ===\n');

if (test('citation with empty key_span', () => {
  const input = `<cite attachment_id='test123' full_phrase='some phrase' key_span='' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  assertEqual(Object.values(result)[0].fullPhrase, 'some phrase');
})) passed++; else failed++;

if (test('citation with very long full_phrase', () => {
  const longPhrase = 'A'.repeat(500) + ' important ' + 'B'.repeat(500);
  const input = `<cite attachment_id='test123' full_phrase='${longPhrase}' key_span='important' start_page_key='page_number_1_index_0' line_ids='1-50' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  if (!Object.values(result)[0].fullPhrase.includes('important')) {
    throw new Error('Long phrase should contain "important"');
  }
})) passed++; else failed++;

if (test('citation at very end of string', () => {
  const input = `Some text <cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
})) passed++; else failed++;

if (test('citation at very beginning of string', () => {
  const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' /> followed by text`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
})) passed++; else failed++;

if (test('citation that is the entire string', () => {
  const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
})) passed++; else failed++;

console.log('\n=== Line_ids edge cases ===\n');

if (test('line_ids with large range', () => {
  const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1-100' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  assertEqual(citation.lineIds.length, 100);
  assertEqual(citation.lineIds[0], 1);
  assertEqual(citation.lineIds[99], 100);
})) passed++; else failed++;

if (test('line_ids with multiple ranges', () => {
  const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='1-3, 10-12, 20' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  assertContains(citation.lineIds, 1);
  assertContains(citation.lineIds, 2);
  assertContains(citation.lineIds, 3);
  assertContains(citation.lineIds, 10);
  assertContains(citation.lineIds, 11);
  assertContains(citation.lineIds, 12);
  assertContains(citation.lineIds, 20);
})) passed++; else failed++;

if (test('line_ids with descending values (should sort ascending)', () => {
  const input = `<cite attachment_id='test123' full_phrase='phrase' key_span='phrase' start_page_key='page_number_1_index_0' line_ids='50, 30, 10, 40, 20' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  assertEqual(JSON.stringify(citation.lineIds), JSON.stringify([10, 20, 30, 40, 50]));
})) passed++; else failed++;

console.log('\n=== Reasoning attribute variations ===\n');

if (test('reasoning with complex explanation', () => {
  const input = `<cite attachment_id='test123' reasoning='This citation references the section where the author discusses: (1) methodology, (2) results, and (3) conclusions - all of which support the claim.' full_phrase='methodology results conclusions' key_span='methodology' start_page_key='page_number_1_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.reasoning || !citation.reasoning.includes('methodology') || !citation.reasoning.includes('conclusions')) {
    throw new Error('Reasoning should contain methodology and conclusions');
  }
})) passed++; else failed++;

if (test('reasoning with numbers and symbols', () => {
  const input = `<cite attachment_id='test123' reasoning='Page 42, Section 3.1.2 shows 95% confidence interval (p<0.05)' full_phrase='95% confidence' key_span='95%' start_page_key='page_number_42_index_0' line_ids='1' />`;
  const result = getAllCitationsFromLlmOutput(input);
  assertEqual(Object.keys(result).length, 1);
  const citation = Object.values(result)[0];
  if (!citation.reasoning || !citation.reasoning.includes('95%')) {
    throw new Error('Reasoning should contain 95%');
  }
})) passed++; else failed++;

console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);
