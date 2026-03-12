import { isRecord, type EditorSession, type UnknownRecord } from './chat-utils';

export type NormalizedHandbookImage = {
  block_id: string;
  block_title: string;
  query: string;
  alt: string;
  image_url: string;
  source?: 'unsplash' | 'imagen';
  source_page: string | null;
  credit: string | null;
  width: number | null;
  height: number | null;
};

function normalizeHandbookImageRecord(value: unknown): NormalizedHandbookImage | null {
  if (!isRecord(value)) return null;
  const blockId =
    typeof value.block_id === 'string' ? value.block_id.trim() : '';
  const imageUrl =
    typeof value.image_url === 'string' ? value.image_url.trim() : '';
  if (!blockId || !imageUrl) return null;

  const source =
    value.source === 'unsplash' || value.source === 'imagen'
      ? value.source
      : undefined;
  const width =
    typeof value.width === 'number' && Number.isFinite(value.width)
      ? value.width
      : null;
  const height =
    typeof value.height === 'number' && Number.isFinite(value.height)
      ? value.height
      : null;

  return {
    block_id: blockId,
    block_title:
      typeof value.block_title === 'string' ? value.block_title.trim() : '',
    query: typeof value.query === 'string' ? value.query.trim() : '',
    alt: typeof value.alt === 'string' ? value.alt.trim() : '',
    image_url: imageUrl,
    ...(source ? { source } : {}),
    source_page:
      typeof value.source_page === 'string' ? value.source_page.trim() : null,
    credit: typeof value.credit === 'string' ? value.credit.trim() : null,
    width,
    height,
  };
}

function normalizeHandbookImageArray(value: unknown): NormalizedHandbookImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeHandbookImageRecord)
    .filter((image): image is NormalizedHandbookImage => image !== null);
}

function normalizeEditableImageSource(
  value: unknown,
): 'unsplash' | 'imagen' | '' {
  return value === 'unsplash' || value === 'imagen' ? value : '';
}

export function extractContextHandbookImages(
  context: unknown,
): NormalizedHandbookImage[] {
  if (!isRecord(context)) return [];
  const camelCaseImages = normalizeHandbookImageArray(context.handbookImages);
  if (camelCaseImages.length > 0) return camelCaseImages;
  return normalizeHandbookImageArray(context.handbook_images);
}

function hasOutputImageUrls(output: UnknownRecord): boolean {
  if (!Array.isArray(output.images)) return false;
  return output.images.some(image => {
    if (!isRecord(image)) return false;
    return typeof image.image_url === 'string' && image.image_url.trim() !== '';
  });
}

export function mergeImagesIntoOutputIfMissing(
  output: UnknownRecord,
  contextImages: NormalizedHandbookImage[],
): UnknownRecord {
  if (contextImages.length === 0) return output;
  if (hasOutputImageUrls(output)) return output;

  return {
    ...output,
    images: contextImages,
    image_count: contextImages.length,
    image_refs: contextImages.map(image => ({
      block_id: image.block_id,
      block_title: image.block_title,
      alt: image.alt,
      source: image.source ?? '',
      credit: image.credit,
    })),
  };
}

function getOutputImagesByBlockId(
  output: UnknownRecord,
): Map<string, NormalizedHandbookImage> {
  const normalizedImages = normalizeHandbookImageArray(output.images);
  const imageByBlockId = new Map<string, NormalizedHandbookImage>();

  for (const image of normalizedImages) {
    imageByBlockId.set(image.block_id, image);
  }

  return imageByBlockId;
}

export function mergeEditorSessionImages(
  session: EditorSession,
  sourceOutput: UnknownRecord,
): EditorSession {
  const imageByBlockId = getOutputImagesByBlockId(sourceOutput);
  if (imageByBlockId.size === 0) return session;

  let changed = false;
  const nextBlocks = session.blocks.map(block => {
    if (block.imageUrl.trim()) return block;
    const matchedImage = imageByBlockId.get(block.block_id);
    if (!matchedImage) return block;

    changed = true;
    const mergedImageSource = normalizeEditableImageSource(
      block.imageSource || matchedImage.source,
    );
    return {
      ...block,
      imageUrl: matchedImage.image_url,
      imageAlt: block.imageAlt.trim() || matchedImage.alt || block.title,
      imageQuery: block.imageQuery.trim() || matchedImage.query,
      imageSource: mergedImageSource,
      imageSourcePage:
        block.imageSourcePage.trim() || matchedImage.source_page || '',
      imageCredit: block.imageCredit.trim() || matchedImage.credit || '',
      imageWidth: block.imageWidth ?? matchedImage.width,
      imageHeight: block.imageHeight ?? matchedImage.height,
    };
  });

  if (!changed) return session;
  return {
    ...session,
    blocks: nextBlocks,
  };
}
