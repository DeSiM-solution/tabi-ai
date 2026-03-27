export type HandbookAddBlockInsertPosition = 'before' | 'after';
export type HandbookAddBlockElementType =
  | 'heading'
  | 'text'
  | 'link'
  | 'divider'
  | 'image'
  | 'button';

export type HandbookAddBlockSelection = {
  insertPosition: HandbookAddBlockInsertPosition;
  elementType: HandbookAddBlockElementType;
};

const DEFAULT_LINK_URL = 'https://example.com';
const DEFAULT_IMAGE_URL = 'https://placehold.co/1200x675?text=Image';

export function resolveHandbookAddBlockSelection(
  selection: HandbookAddBlockSelection | undefined,
): HandbookAddBlockSelection {
  const insertPosition =
    selection?.insertPosition === 'before' ? 'before' : 'after';

  const elementType = selection?.elementType;
  if (
    elementType === 'heading'
    || elementType === 'text'
    || elementType === 'link'
    || elementType === 'divider'
    || elementType === 'image'
    || elementType === 'button'
  ) {
    return {
      insertPosition,
      elementType,
    };
  }

  return {
    insertPosition,
    elementType: 'text',
  };
}

export function buildHandbookAddBlockMarkup(
  elementType: HandbookAddBlockElementType,
): string {
  switch (elementType) {
    case 'heading':
      return '<h2>Heading</h2>';
    case 'text':
      return '<p>Text</p>';
    case 'link':
      return `<a href="${DEFAULT_LINK_URL}" target="_blank" rel="noopener noreferrer">Link</a>`;
    case 'divider':
      return '<hr />';
    case 'image':
      return `<img src="${DEFAULT_IMAGE_URL}" alt="" />`;
    case 'button':
      return '<button type="button">Button</button>';
    default:
      return '<p>Text</p>';
  }
}
