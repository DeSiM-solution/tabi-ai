export type HandbookDocumentShell = {
  doctype: string;
  htmlAttributes: string;
  bodyAttributes: string;
  headHtml: string;
};

export type HandbookEditorInput = {
  documentShell: HandbookDocumentShell;
  bodyHtml: string;
  cssText: string;
};

export type BuildHandbookHtmlArgs = {
  documentShell: HandbookDocumentShell;
  bodyHtml: string;
  cssText: string;
};

const DOCTYPE_PATTERN = /<!doctype[^>]*>/i;
const HTML_OPEN_TAG_PATTERN = /<html([^>]*)>/i;
const HEAD_CONTENT_PATTERN = /<head[^>]*>([\s\S]*?)<\/head>/i;
const BODY_OPEN_TAG_PATTERN = /<body([^>]*)>/i;
const BODY_CONTENT_PATTERN = /<body[^>]*>([\s\S]*?)<\/body>/i;
const STYLE_TAG_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

function toAttributeString(rawAttributes: string | undefined): string {
  const normalized = rawAttributes?.trim() ?? '';
  return normalized ? ` ${normalized}` : '';
}

function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(BODY_CONTENT_PATTERN);
  if (bodyMatch?.[1]) {
    return bodyMatch[1].trim();
  }
  return html.trim();
}

function extractHeadHtml(html: string): string {
  return html.match(HEAD_CONTENT_PATTERN)?.[1]?.trim() ?? '';
}

function extractCssText(headHtml: string): string {
  return Array.from(headHtml.matchAll(STYLE_TAG_PATTERN))
    .map(match => match[1]?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
}

function stripStyleTags(headHtml: string): string {
  return headHtml.replace(STYLE_TAG_PATTERN, '').trim();
}

export function extractHandbookEditorInput(html: string): HandbookEditorInput {
  const trimmedHtml = html.trim();
  const headHtml = extractHeadHtml(trimmedHtml);

  return {
    documentShell: {
      doctype: trimmedHtml.match(DOCTYPE_PATTERN)?.[0] ?? '<!doctype html>',
      htmlAttributes: toAttributeString(trimmedHtml.match(HTML_OPEN_TAG_PATTERN)?.[1]),
      bodyAttributes: toAttributeString(trimmedHtml.match(BODY_OPEN_TAG_PATTERN)?.[1]),
      headHtml: stripStyleTags(headHtml),
    },
    bodyHtml: extractBodyHtml(trimmedHtml),
    cssText: extractCssText(headHtml),
  };
}

export function buildHandbookHtml({
  documentShell,
  bodyHtml,
  cssText,
}: BuildHandbookHtmlArgs): string {
  const headSegments = [
    documentShell.headHtml.trim(),
    cssText.trim() ? `<style>\n${cssText.trim()}\n</style>` : '',
  ].filter(Boolean);

  const headHtml = headSegments.length > 0
    ? `\n${headSegments.join('\n')}\n`
    : '\n';

  return [
    documentShell.doctype || '<!doctype html>',
    `<html${documentShell.htmlAttributes}>`,
    `<head>${headHtml}</head>`,
    `<body${documentShell.bodyAttributes}>`,
    bodyHtml.trim(),
    '</body>',
    '</html>',
  ].join('\n');
}
