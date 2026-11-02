import { describe, it, expect } from 'vitest';
import { htmlToParagraphs, decodeEntities } from '../src/lib/htmlToParagraphs.js';

describe('decodeEntities', () => {
  it('decodes the common named entities to their literal character', () => {
    expect(decodeEntities('Sports Management &amp; Legal Skills')).toBe('Sports Management & Legal Skills');
    expect(decodeEntities('&lt;tag&gt; &quot;quoted&quot;')).toBe('<tag> "quoted"');
    expect(decodeEntities('curly &rsquo;quote&rsquo;')).toBe('curly ’quote’');
  });

  it('decodes numeric entities, decimal and hex', () => {
    expect(decodeEntities('&#38;')).toBe('&');
    expect(decodeEntities('&#x26;')).toBe('&');
  });

  it('leaves ordinary text and an unrecognised entity-shaped string alone', () => {
    expect(decodeEntities('Plain text, nothing to decode.')).toBe('Plain text, nothing to decode.');
    expect(decodeEntities('A&Bcompany')).toBe('A&Bcompany'); // not a valid entity shape, left as-is
  });
});

describe('htmlToParagraphs', () => {
  it('splits adjacent <p> blocks with no gap between them into separate paragraphs', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p><p>Third.</p>';
    expect(htmlToParagraphs(html)).toBe('First paragraph.\n\nSecond paragraph.\n\nThird.');
  });

  it('decodes an entity inside a paragraph rather than leaving it escaped', () => {
    const html = '<p>Sports Management &amp; Legal Skills.</p>';
    expect(htmlToParagraphs(html)).toBe('Sports Management & Legal Skills.');
  });

  it('strips inline tags within a paragraph without losing the text', () => {
    const html = '<p>She holds an <strong>LLM</strong> from <em>DMU</em>.</p>';
    expect(htmlToParagraphs(html)).toBe('She holds an LLM from DMU.');
  });

  it('treats a source with no <p> tags as one paragraph', () => {
    expect(htmlToParagraphs('Just plain text, no markup.')).toBe('Just plain text, no markup.');
  });

  it('drops an empty paragraph rather than leaving a stray blank line', () => {
    expect(htmlToParagraphs('<p>One.</p><p></p><p>Two.</p>')).toBe('One.\n\nTwo.');
  });

  it('returns an empty string for empty or missing input', () => {
    expect(htmlToParagraphs('')).toBe('');
    expect(htmlToParagraphs(null)).toBe('');
    expect(htmlToParagraphs(undefined)).toBe('');
  });

  it('matches Caroline Mwanzia\'s real stored profile shape: five adjacent <p> blocks, one with &amp;', () => {
    const html = '<p>Caroline M. Mwanzia is a Sports Advocate.</p><p>She is an Associate at PCN Sportiva LP.</p>'
      + '<p>She is a FIFA Licensed Football Agent.</p><p>Caroline has particular expertise in ADRV litigation.</p>'
      + '<p>She holds a Master’s degree in Sports Management &amp; Legal Skills from FC Barcelona-ISDE.</p>';
    const result = htmlToParagraphs(html);
    expect(result.split('\n\n')).toHaveLength(5);
    expect(result).toContain('Sports Management & Legal Skills');
    expect(result).not.toContain('&amp;');
  });
});
