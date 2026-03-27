'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Component, Editor } from 'grapesjs';

import {
  buildHandbookHtml,
  extractHandbookEditorInput,
  type HandbookDocumentShell,
} from '../_lib/handbook-html-adapter';
import {
  buildHandbookStylePatch,
  createHandbookSelectionSnapshot,
  type HandbookSelectionAnchorRect,
  type HandbookSelectionSnapshot,
  type HandbookStyleProperty,
} from '../_lib/handbook-selection';
import {
  buildHandbookAddBlockMarkup,
  resolveHandbookAddBlockSelection,
  type HandbookAddBlockSelection,
} from '../_lib/handbook-add-block';
import {
  toggleHandbookTextDecorationValue,
} from '../_lib/handbook-toolbar-formatting';

type UseGrapesJsEditorArgs = {
  container: HTMLDivElement | null;
  documentHtml: string;
  onDocumentHtmlChange: (nextDocumentHtml: string) => void;
  onSelectionChange?: (selection: HandbookSelectionSnapshot | null) => void;
};

export type HandbookTextToolbarActions = {
  openImagePicker: () => boolean;
  setLink: (url: string) => boolean;
  clearLink: () => boolean;
  setColor: (value: string) => boolean;
  setFontSize: (value: string) => boolean;
  toggleBold: () => boolean;
  toggleItalic: () => boolean;
  toggleUnderline: () => boolean;
  toggleStrike: () => boolean;
};

export type HandbookBlockToolbarActions = {
  openAiTool: () => boolean;
  addBlock: (selection?: HandbookAddBlockSelection) => boolean;
  selectParent: () => boolean;
  dragToMove: () => boolean;
  duplicateSelection: () => boolean;
  deleteSelection: () => boolean;
};

export type HandbookHoverElementKind = 'Heading' | 'Image' | 'Text' | 'Block';

export type HandbookHoverBoxSpacing = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type HandbookHoverHighlight = {
  kind: HandbookHoverElementKind;
  kindToken: 'H' | 'I' | 'T' | 'B';
  tagName: string;
  anchorRect: HandbookSelectionAnchorRect;
  margin: HandbookHoverBoxSpacing;
  padding: HandbookHoverBoxSpacing;
};

export type HandbookImagePickerState = {
  open: boolean;
  mode: 'insert' | 'replace';
  currentImageUrl: string;
};

type UseGrapesJsEditorResult = {
  errorMessage: string | null;
  isReady: boolean;
  canvasRect: HandbookSelectionAnchorRect | null;
  selection: HandbookSelectionSnapshot | null;
  hoverHighlight: HandbookHoverHighlight | null;
  imagePickerState: HandbookImagePickerState;
  applySelectionStyle: (property: HandbookStyleProperty, value: string) => boolean;
  applyImageFromPicker: (imageUrl: string) => boolean;
  closeImagePicker: () => void;
  textToolbarActions: HandbookTextToolbarActions;
  blockToolbarActions: HandbookBlockToolbarActions;
};

type GrapesStyleTarget = {
  getStyle: () => Record<string, unknown>;
  setStyle: (style: Record<string, string>) => unknown;
};

const HEADING_TAG_PATTERN = /^h[1-6]$/;
const IMAGE_LIKE_TAGS = new Set(['img', 'picture', 'svg', 'canvas', 'video']);
const TEXT_LIKE_TAGS = new Set([
  'a',
  'blockquote',
  'code',
  'em',
  'label',
  'li',
  'p',
  'small',
  'span',
  'strong',
]);
const TEXT_TOOLBAR_DOM_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'blockquote',
  'code',
  'em',
  'label',
  'li',
  'p',
  'small',
  'span',
  'strong',
].join(',');
const RANGE_STYLE_PROPERTIES = new Set([
  'color',
  'font-size',
  'font-style',
  'font-weight',
  'text-decoration',
]);

const GRAPESJS_CANVAS_LAYOUT_STYLE_ID = 'tabi-grapesjs-canvas-layout';

let grapesJsCanvasLayoutStyleUsers = 0;

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function shouldShowImagePickerDebugAlert(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const query = new URLSearchParams(window.location.search);
    const fromQuery = query.get('debugImagePickerAlert') ?? query.get('debugImagePicker');
    let fromStorage: string | null = null;
    try {
      fromStorage = window.localStorage.getItem('tabi:image-picker-debug-alert');
    } catch {
      // localStorage can be blocked in some browser/privacy contexts.
    }
    const fromGlobal =
      (window as Window & { __TABI_IMAGE_PICKER_DEBUG_ALERT__?: boolean })
        .__TABI_IMAGE_PICKER_DEBUG_ALERT__;
    return fromQuery === '1' || fromStorage === '1' || fromGlobal === true;
  } catch {
    return false;
  }
}

function emitImagePickerDebug(event: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  try {
    console.log(`[image-picker] ${event}`, payload);
  } catch {
    // Keep interaction resilient even if console is unavailable.
  }

  if (!shouldShowImagePickerDebugAlert()) return;
  const lines = Object.entries(payload).map(([key, value]) => `${key}: ${String(value)}`);
  const message = [`[image-picker] ${event}`, ...lines].join('\n');
  try {
    window.alert(message);
  } catch {
    // Ignore alert errors in environments that block alert calls.
  }
}

function ensureGrapesJsCanvasLayoutStyles(): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  let styleElement = document.getElementById(
    GRAPESJS_CANVAS_LAYOUT_STYLE_ID,
  ) as HTMLStyleElement | null;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = GRAPESJS_CANVAS_LAYOUT_STYLE_ID;
    styleElement.textContent = `
      .gjs-editor {
        position: relative;
        height: 100%;
      }

      .gjs-editor-cont {
        position: relative;
        height: 100%;
      }

      .gjs-cv-canvas {
        position: absolute;
        inset: 0;
        overflow: auto;
        z-index: 1;
      }

      .gjs-cv-canvas__frames {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .gjs-cv-canvas__spots {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 1;
      }

      .gjs-frame-wrapper {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .gjs-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
      }

      .gjs-cv-canvas #gjs-tools,
      .gjs-cv-canvas #gjs-cv-tools,
      .gjs-cv-canvas .gjs-cv-tools,
      .gjs-cv-canvas .gjs-tools {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        outline: none;
        z-index: 1;
        pointer-events: none;
      }

      .gjs-cv-canvas .gjs-highlighter,
      .gjs-cv-canvas .gjs-highlighter-sel {
        position: absolute;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .gjs-cv-canvas .gjs-highlighter-badge,
      .gjs-cv-canvas .gjs-badge {
        display: none !important;
      }

      .gjs-rte-toolbar {
        display: none !important;
      }

      .gjs-toolbar {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 10;
        white-space: nowrap;
        pointer-events: auto;
      }

      .gjs-resizer-c {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9;
        pointer-events: auto;
      }
    `;
    document.head.appendChild(styleElement);
  }

  grapesJsCanvasLayoutStyleUsers += 1;

  return () => {
    grapesJsCanvasLayoutStyleUsers = Math.max(0, grapesJsCanvasLayoutStyleUsers - 1);
    if (grapesJsCanvasLayoutStyleUsers === 0) {
      styleElement?.remove();
    }
  };
}

function toNonNegativeNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function isBoldStyleValue(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'bold') return true;
  const numericWeight = Number(normalizedValue);
  return Number.isFinite(numericWeight) && numericWeight >= 600;
}

function isItalicStyleValue(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === 'italic' || normalizedValue === 'oblique';
}

function resolveHoverElementKind(tagName: string): {
  kind: HandbookHoverElementKind;
  kindToken: HandbookHoverHighlight['kindToken'];
} {
  const normalizedTagName = tagName.trim().toLowerCase();
  if (HEADING_TAG_PATTERN.test(normalizedTagName)) {
    return { kind: 'Heading', kindToken: 'H' };
  }
  if (IMAGE_LIKE_TAGS.has(normalizedTagName)) {
    return { kind: 'Image', kindToken: 'I' };
  }
  if (TEXT_LIKE_TAGS.has(normalizedTagName)) {
    return { kind: 'Text', kindToken: 'T' };
  }
  return { kind: 'Block', kindToken: 'B' };
}

function resolveSelectionAnchorRect(
  editor: Editor,
  component: Component,
): HandbookSelectionAnchorRect | null {
  try {
    const frame = editor.Canvas.getFrame();
    const frameEl = editor.Canvas.getFrameEl();
    const componentEl = component.getEl(frame) ?? component.getEl();
    if (!frameEl || !componentEl) return null;

    const frameRect = frameEl.getBoundingClientRect();
    const componentRect = componentEl.getBoundingClientRect();

    return {
      top: frameRect.top + componentRect.top,
      left: frameRect.left + componentRect.left,
      width: componentRect.width,
      height: componentRect.height,
    };
  } catch {
    return null;
  }
}

function resolveCanvasRect(editor: Editor): HandbookSelectionAnchorRect | null {
  try {
    const frameEl = editor.Canvas.getFrameEl();
    if (!frameEl) return null;
    const frameRect = frameEl.getBoundingClientRect();
    if (frameRect.width <= 0 || frameRect.height <= 0) return null;

    return {
      top: frameRect.top,
      left: frameRect.left,
      width: frameRect.width,
      height: frameRect.height,
    };
  } catch {
    return null;
  }
}

function resolveComponentFromElement(editor: Editor, element: HTMLElement): Component | null {
  const frame = editor.Canvas.getFrame();
  const wrapper = editor.getWrapper();
  if (!wrapper) return null;

  const findDeepestMatch = (component: Component): Component | null => {
    const componentElement = component.getEl(frame) ?? component.getEl();
    if (!componentElement) return null;
    if (!(componentElement === element || componentElement.contains(element))) return null;

    const children = (component.components?.() as { models?: Component[] } | undefined)?.models ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (!child) continue;
      const nestedMatch = findDeepestMatch(child);
      if (nestedMatch) return nestedMatch;
    }

    return component;
  };

  return findDeepestMatch(wrapper);
}

function resolveComponentById(editor: Editor, componentId: string): Component | null {
  const normalizedComponentId = componentId.trim();
  if (!normalizedComponentId) return null;

  const wrapper = editor.getWrapper();
  if (!wrapper) return null;

  const queue: Component[] = [wrapper];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.getId() === normalizedComponentId) return current;

    const children = (current.components?.() as { models?: Component[] } | undefined)?.models ?? [];
    for (const child of children) {
      if (child) queue.push(child);
    }
  }

  return null;
}

function resolveComputedStyleFallback(component: Component, editor: Editor): Record<string, string> {
  try {
    const frame = editor.Canvas.getFrame();
    const componentElement = component.getEl(frame) ?? component.getEl();
    if (!(componentElement instanceof HTMLElement)) return {};

    const view = componentElement.ownerDocument?.defaultView;
    if (!view) return {};

    const computedStyle = view.getComputedStyle(componentElement);
    return {
      'font-size': computedStyle.fontSize.trim(),
      'font-weight': computedStyle.fontWeight.trim(),
      'font-style': computedStyle.fontStyle.trim(),
      color: computedStyle.color.trim(),
      'line-height': computedStyle.lineHeight.trim(),
      'letter-spacing': computedStyle.letterSpacing.trim(),
      'text-align': computedStyle.textAlign.trim(),
      'vertical-align': computedStyle.verticalAlign.trim(),
      'text-decoration': computedStyle.textDecoration.trim(),
      'text-decoration-line': computedStyle.textDecorationLine.trim(),
    };
  } catch {
    return {};
  }
}

function isSameOrDescendantComponent(component: Component, ancestorComponentId: string): boolean {
  const normalizedAncestorComponentId = ancestorComponentId.trim();
  if (!normalizedAncestorComponentId) return false;

  let current: Component | null | undefined = component;
  while (current) {
    if (current.getId() === normalizedAncestorComponentId) {
      return true;
    }
    current = current.parent();
  }

  return false;
}

function isImageLikeComponent(component: Component): boolean {
  const normalizedTagName = component.tagName.trim().toLowerCase();
  const normalizedType = component.getType().trim().toLowerCase();
  const attributes = component.getAttributes({
    noStyle: true,
    skipResolve: true,
  }) as Record<string, unknown> | undefined;
  const hasImageSrcAttribute =
    typeof attributes?.src === 'string' && attributes.src.trim().length > 0;
  return (
    IMAGE_LIKE_TAGS.has(normalizedTagName)
    || normalizedType.includes('image')
    || hasImageSrcAttribute
  );
}

function isTextLikeComponent(component: Component): boolean {
  const normalizedTagName = component.tagName.trim().toLowerCase();
  const normalizedType = component.getType().trim().toLowerCase();
  return (
    HEADING_TAG_PATTERN.test(normalizedTagName)
    || TEXT_LIKE_TAGS.has(normalizedTagName)
    || normalizedType.includes('text')
  );
}

function resolveImageSrcFromComponent(component: Component): string {
  const attributes = component.getAttributes({
    noStyle: true,
    skipResolve: true,
  }) as Record<string, unknown> | undefined;
  return typeof attributes?.src === 'string' ? attributes.src.trim() : '';
}

function findTextLikeDescendant(component: Component): Component | null {
  const children = (component.components?.() as { models?: Component[] } | undefined)?.models ?? [];
  for (const child of children) {
    if (!child) continue;
    if (isTextLikeComponent(child)) {
      return child;
    }
    const nested = findTextLikeDescendant(child);
    if (nested) return nested;
  }
  return null;
}

function findImageLikeDescendant(component: Component): Component | null {
  const children = (component.components?.() as { models?: Component[] } | undefined)?.models ?? [];
  for (const child of children) {
    if (!child) continue;
    if (isImageLikeComponent(child)) {
      return child;
    }
    const nested = findImageLikeDescendant(child);
    if (nested) return nested;
  }
  return null;
}

function applyInlineStyleToSelectedText(
  frameDocument: Document,
  range: Range,
  stylePatch: Record<string, string>,
): Range | null {
  if (range.collapsed) return null;

  const wrapper = frameDocument.createElement('span');
  for (const [property, rawValue] of Object.entries(stylePatch)) {
    const value = rawValue.trim();
    if (!value) {
      wrapper.style.removeProperty(property);
      continue;
    }
    wrapper.style.setProperty(property, value);
  }

  const extractedContents = range.extractContents();
  wrapper.appendChild(extractedContents);
  range.insertNode(wrapper);

  const nextRange = frameDocument.createRange();
  nextRange.selectNodeContents(wrapper);
  return nextRange;
}

export function useGrapesJsEditor({
  container,
  documentHtml,
  onDocumentHtmlChange,
  onSelectionChange,
}: UseGrapesJsEditorArgs): UseGrapesJsEditorResult {
  const editorRef = useRef<Editor | null>(null);
  const applyingExternalDocumentRef = useRef(false);
  const revealExternalDocumentTimerRef = useRef<number | null>(null);
  const selectionSyncRafRef = useRef<number | null>(null);
  const hoverSyncRafRef = useRef<number | null>(null);
  const documentChangeRafRef = useRef<number | null>(null);
  const pendingDocumentHtmlRef = useRef<string | null>(null);
  const documentHtmlRef = useRef(documentHtml);
  const lastSyncedDocumentHtmlRef = useRef(documentHtml);
  const documentShellRef = useRef<HandbookDocumentShell | null>(null);
  const selectedStyleTargetRef = useRef<GrapesStyleTarget | null>(null);
  const selectedComponentRef = useRef<Component | null>(null);
  const textToolbarComponentIdRef = useRef<string | null>(null);
  const savedTextRangeRef = useRef<Range | null>(null);
  const imagePickerTargetComponentIdRef = useRef<string | null>(null);
  const imagePickerOpenRef = useRef(false);
  const selectionRef = useRef<HandbookSelectionSnapshot | null>(null);
  const onDocumentHtmlChangeRef = useRef(onDocumentHtmlChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canvasRect, setCanvasRect] = useState<HandbookSelectionAnchorRect | null>(null);
  const [selection, setSelection] = useState<HandbookSelectionSnapshot | null>(null);
  const [hoverHighlight, setHoverHighlight] = useState<HandbookHoverHighlight | null>(null);
  const [imagePickerState, setImagePickerState] = useState<HandbookImagePickerState>({
    open: false,
    mode: 'insert',
    currentImageUrl: '',
  });

  useEffect(() => {
    imagePickerOpenRef.current = imagePickerState.open;
    emitImagePickerDebug('state-change', {
      open: imagePickerState.open,
      mode: imagePickerState.mode,
      currentImageUrl: imagePickerState.currentImageUrl,
      targetComponentId: imagePickerTargetComponentIdRef.current ?? '',
    });
  }, [imagePickerState.currentImageUrl, imagePickerState.mode, imagePickerState.open]);

  useEffect(() => {
    documentHtmlRef.current = documentHtml;
  }, [documentHtml]);

  useEffect(() => {
    onDocumentHtmlChangeRef.current = onDocumentHtmlChange;
  }, [onDocumentHtmlChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const publishSelection = useCallback((nextSelection: HandbookSelectionSnapshot | null) => {
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    onSelectionChangeRef.current?.(nextSelection);
  }, []);

  const clearHoverHighlight = useCallback(() => {
    hoveredElementRef.current = null;
    setHoverHighlight(null);
  }, []);

  const syncHoverHighlightFromElement = useCallback((editor: Editor, element: HTMLElement) => {
    const frameEl = editor.Canvas.getFrameEl();
    if (!frameEl) {
      clearHoverHighlight();
      return;
    }

    const tagName = element.tagName.trim().toLowerCase();
    if (!tagName || tagName === 'body' || tagName === 'html') {
      clearHoverHighlight();
      return;
    }

    const frameRect = frameEl.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (elementRect.width <= 0 || elementRect.height <= 0) {
      clearHoverHighlight();
      return;
    }

    const computedStyle = window.getComputedStyle(element);
    const margin: HandbookHoverBoxSpacing = {
      top: toNonNegativeNumber(computedStyle.marginTop),
      right: toNonNegativeNumber(computedStyle.marginRight),
      bottom: toNonNegativeNumber(computedStyle.marginBottom),
      left: toNonNegativeNumber(computedStyle.marginLeft),
    };
    const padding: HandbookHoverBoxSpacing = {
      top: toNonNegativeNumber(computedStyle.paddingTop),
      right: toNonNegativeNumber(computedStyle.paddingRight),
      bottom: toNonNegativeNumber(computedStyle.paddingBottom),
      left: toNonNegativeNumber(computedStyle.paddingLeft),
    };
    const anchorRect: HandbookSelectionAnchorRect = {
      top: frameRect.top + elementRect.top,
      left: frameRect.left + elementRect.left,
      width: elementRect.width,
      height: elementRect.height,
    };
    const kindInfo = resolveHoverElementKind(tagName);

    hoveredElementRef.current = element;
    setHoverHighlight({
      ...kindInfo,
      tagName,
      anchorRect,
      margin,
      padding,
    });
  }, [clearHoverHighlight]);

  const scheduleHoverHighlightSync = useCallback((element: HTMLElement | null) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!element) {
      clearHoverHighlight();
      return;
    }
    if (hoverSyncRafRef.current !== null) {
      window.cancelAnimationFrame(hoverSyncRafRef.current);
      hoverSyncRafRef.current = null;
    }
    hoverSyncRafRef.current = window.requestAnimationFrame(() => {
      hoverSyncRafRef.current = null;
      syncHoverHighlightFromElement(editor, element);
    });
  }, [clearHoverHighlight, syncHoverHighlightFromElement]);

  const closeImagePicker = useCallback(() => {
    const previousTargetComponentId = imagePickerTargetComponentIdRef.current;
    emitImagePickerDebug('close', {
      targetComponentId: previousTargetComponentId ?? '',
      reason: 'manual-or-state-transition',
    });
    imagePickerTargetComponentIdRef.current = null;
    setImagePickerState(previousState => (
      previousState.open
        ? {
            ...previousState,
            open: false,
          }
        : previousState
    ));
  }, []);

  const openImagePickerForInsert = useCallback((): boolean => {
    emitImagePickerDebug('open-insert', {
      selectedComponentId: selectedComponentRef.current?.getId() ?? '',
      selectedTagName: selectedComponentRef.current?.tagName ?? '',
    });
    imagePickerTargetComponentIdRef.current = null;
    setImagePickerState({
      open: true,
      mode: 'insert',
      currentImageUrl: '',
    });
    return true;
  }, []);

  const openImagePickerForReplace = useCallback((component: Component): boolean => {
    if (!isImageLikeComponent(component)) {
      emitImagePickerDebug('open-replace-skipped-non-image', {
        componentId: component.getId(),
        tagName: component.tagName,
        componentType: component.getType(),
      });
      return false;
    }
    emitImagePickerDebug('open-replace', {
      componentId: component.getId(),
      tagName: component.tagName,
      componentType: component.getType(),
      currentImageUrl: resolveImageSrcFromComponent(component),
    });
    imagePickerTargetComponentIdRef.current = component.getId();

    const editor = editorRef.current;
    if (editor) {
      const selectedComponent = editor.getSelected() ?? selectedComponentRef.current;
      if (!selectedComponent || selectedComponent.getId() !== component.getId()) {
        editor.select(component);
      }
    }

    setImagePickerState({
      open: true,
      mode: 'replace',
      currentImageUrl: resolveImageSrcFromComponent(component),
    });
    return true;
  }, []);

  const syncSelectedComponent = useCallback((editor: Editor) => {
    setCanvasRect(resolveCanvasRect(editor));
    const component = editor.getSelected() ?? null;
    selectedComponentRef.current = component;

    const selectedStyleTarget =
      (editor.getSelectedToStyle() as GrapesStyleTarget | undefined)
      ?? (component as unknown as GrapesStyleTarget | null)
      ?? null;
    selectedStyleTargetRef.current = selectedStyleTarget;

    if (!component) {
      textToolbarComponentIdRef.current = null;
      savedTextRangeRef.current = null;
      publishSelection(null);
      return;
    }

    if (
      textToolbarComponentIdRef.current
      && !isSameOrDescendantComponent(component, textToolbarComponentIdRef.current)
    ) {
      textToolbarComponentIdRef.current = null;
      savedTextRangeRef.current = null;
    }

    const parentComponent = component.parent();
    const styleFromSelectionTarget =
      selectedStyleTarget?.getStyle()
      ?? component.getStyle()
      ?? {};
    const computedStyleFallback = resolveComputedStyleFallback(component, editor);
    const mergedStyles: Record<string, unknown> = {
      ...computedStyleFallback,
    };
    for (const [property, rawValue] of Object.entries(styleFromSelectionTarget)) {
      const normalizedValue = String(rawValue ?? '').trim();
      if (!normalizedValue) continue;
      mergedStyles[property] = normalizedValue;
    }

    const snapshot = createHandbookSelectionSnapshot({
      componentId: component.getId(),
      componentName: component.getName(),
      componentType: component.getType(),
      tagName: component.tagName,
      parentComponentId: parentComponent?.getId() ?? null,
      parentComponentName: parentComponent?.getName() ?? null,
      anchorRect: resolveSelectionAnchorRect(editor, component),
      attributes: component.getAttributes({
        noStyle: true,
        skipResolve: true,
      }),
      styles: mergedStyles,
    });

    if (!snapshot.canDuplicate) {
      textToolbarComponentIdRef.current = null;
      savedTextRangeRef.current = null;
      publishSelection(snapshot);
      return;
    }

    const isTextToolbarActive =
      snapshot.isTextEditable
      && Boolean(
        textToolbarComponentIdRef.current
        && isSameOrDescendantComponent(component, textToolbarComponentIdRef.current),
      );

    publishSelection({
      ...snapshot,
      showTextToolbar: isTextToolbarActive,
      showBlockToolbar: !isTextToolbarActive,
    });
  }, [publishSelection]);

  const scheduleSelectionSync = useCallback(() => {
    if (selectionSyncRafRef.current !== null) return;

    selectionSyncRafRef.current = window.requestAnimationFrame(() => {
      selectionSyncRafRef.current = null;
      const editor = editorRef.current;
      if (!editor) return;
      syncSelectedComponent(editor);
    });
  }, [syncSelectedComponent]);

  const publishDocumentChange = useCallback((nextDocumentHtml: string) => {
    pendingDocumentHtmlRef.current = nextDocumentHtml;
    if (documentChangeRafRef.current !== null) return;

    documentChangeRafRef.current = window.requestAnimationFrame(() => {
      documentChangeRafRef.current = null;
      const pendingDocumentHtml = pendingDocumentHtmlRef.current;
      if (pendingDocumentHtml === null) return;
      pendingDocumentHtmlRef.current = null;
      onDocumentHtmlChangeRef.current(pendingDocumentHtml);
    });
  }, []);

  const resolveTextSelectionContext = useCallback((): {
    editor: Editor;
    frameWindow: Window;
    frameDocument: Document;
    selection: Selection;
    range: Range;
  } | null => {
    const editor = editorRef.current;
    const selectedComponent = selectedComponentRef.current;
    const textToolbarComponentId = textToolbarComponentIdRef.current;
    if (!editor || !selectedComponent || !textToolbarComponentId) return null;
    if (!isSameOrDescendantComponent(selectedComponent, textToolbarComponentId)) return null;

    const frameWindow = editor.Canvas.getWindow();
    const frameDocument = frameWindow?.document;
    const selection = frameWindow?.getSelection?.() ?? null;
    const frame = editor.Canvas.getFrame();
    const componentElement = selectedComponent.getEl(frame) ?? selectedComponent.getEl();
    if (!frameWindow || !frameDocument || !selection || !componentElement) {
      return null;
    }

    const normalizeCandidateRange = (candidateRange: Range | null): Range | null => {
      if (!candidateRange || candidateRange.collapsed) return null;
      const commonAncestorNode = candidateRange.commonAncestorContainer;
      const commonAncestorElement =
        commonAncestorNode.nodeType === Node.ELEMENT_NODE
          ? commonAncestorNode as Element
          : commonAncestorNode.parentElement;
      if (!commonAncestorElement) return null;
      if (!componentElement.contains(commonAncestorElement)) return null;
      return candidateRange.cloneRange();
    };

    const selectedRange = selection.rangeCount > 0
      ? normalizeCandidateRange(selection.getRangeAt(0))
      : null;
    const savedRange = normalizeCandidateRange(savedTextRangeRef.current);
    const range = selectedRange ?? savedRange;
    if (!range) return null;

    selection.removeAllRanges();
    selection.addRange(range);
    return {
      editor,
      frameWindow,
      frameDocument,
      selection,
      range,
    };
  }, []);

  const rememberActiveTextRange = useCallback((frameWindow: Window | null | undefined) => {
    const selectedComponent = selectedComponentRef.current;
    const textToolbarComponentId = textToolbarComponentIdRef.current;
    if (!selectedComponent || !textToolbarComponentId) return;
    if (!isSameOrDescendantComponent(selectedComponent, textToolbarComponentId)) return;
    if (!frameWindow) return;

    const selection = frameWindow.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const editor = editorRef.current;
    if (!editor) return;

    const frame = editor.Canvas.getFrame();
    const componentElement = selectedComponent.getEl(frame) ?? selectedComponent.getEl();
    if (!componentElement) return;

    const commonAncestorNode = range.commonAncestorContainer;
    const commonAncestorElement =
      commonAncestorNode.nodeType === Node.ELEMENT_NODE
        ? commonAncestorNode as Element
        : commonAncestorNode.parentElement;
    if (!commonAncestorElement || !componentElement.contains(commonAncestorElement)) return;

    savedTextRangeRef.current = range.cloneRange();
  }, []);

  const selectPlainTextContentForEditing = useCallback(
    (editor: Editor, component: Component, triggerElement: HTMLElement): void => {
      const frame = editor.Canvas.getFrame();
      const frameWindow = editor.Canvas.getWindow();
      const frameDocument = frameWindow?.document;
      const componentElement = component.getEl(frame) ?? component.getEl();
      if (!frameWindow || !frameDocument || !componentElement) return;
      if (triggerElement !== componentElement) return;
      if (componentElement.children.length > 0) return;
      if (!componentElement.textContent?.trim()) return;

      const selection = frameWindow.getSelection?.();
      if (!selection) return;

      const range = frameDocument.createRange();
      range.selectNodeContents(componentElement);
      selection.removeAllRanges();
      selection.addRange(range);
      savedTextRangeRef.current = range.cloneRange();
    },
    [],
  );

  const applyStylePatchToSelectedTextRange = useCallback(
    (patch: Record<string, string>): boolean => {
      if (!textToolbarComponentIdRef.current) return false;
      const patchKeys = Object.keys(patch);
      if (patchKeys.length === 0) return false;
      if (patchKeys.some(property => !RANGE_STYLE_PROPERTIES.has(property))) {
        return false;
      }

      const context = resolveTextSelectionContext();
      if (!context) return false;

      const {
        editor,
        frameWindow,
        frameDocument,
        selection,
        range,
      } = context;

      frameWindow.focus();
      const nextRange = applyInlineStyleToSelectedText(frameDocument, range, patch);
      if (!nextRange) return false;

      selection.removeAllRanges();
      selection.addRange(nextRange);
      savedTextRangeRef.current = nextRange.cloneRange();
      syncSelectedComponent(editor);
      return true;
    },
    [resolveTextSelectionContext, syncSelectedComponent],
  );

  const applyStylePatchToSelectedComponent = useCallback((patch: Record<string, string>): boolean => {
    const selectedStyleTarget = selectedStyleTargetRef.current;
    const editor = editorRef.current;
    if (!selectedStyleTarget || !editor) return false;

    const currentStyle = selectedStyleTarget.getStyle();
    const mergedStyle: Record<string, string> = {};
    for (const [property, rawValue] of Object.entries(currentStyle)) {
      const normalizedValue = String(rawValue ?? '').trim();
      if (!normalizedValue) continue;
      mergedStyle[property] = normalizedValue;
    }

    for (const [property, rawValue] of Object.entries(patch)) {
      const normalizedValue = rawValue.trim();
      if (!normalizedValue) {
        delete mergedStyle[property];
        continue;
      }
      mergedStyle[property] = normalizedValue;
    }

    selectedStyleTarget.setStyle(mergedStyle);
    syncSelectedComponent(editor);
    return true;
  }, [syncSelectedComponent]);

  const applyStylePatch = useCallback((patch: Record<string, string>): boolean => {
    if (applyStylePatchToSelectedTextRange(patch)) {
      return true;
    }

    return applyStylePatchToSelectedComponent(patch);
  }, [applyStylePatchToSelectedComponent, applyStylePatchToSelectedTextRange]);

  const applySelectionStyle = useCallback(
    (property: HandbookStyleProperty, value: string): boolean => {
      return applyStylePatch(buildHandbookStylePatch(property, value));
    },
    [applyStylePatch],
  );

  const updateSelectionAttributes = useCallback(
    (attributes: Record<string, string>): boolean => {
      const component = selectedComponentRef.current;
      const editor = editorRef.current;
      if (!component || !editor) return false;

      const attributeEntries = Object.entries(attributes);
      const removableAttributes = attributeEntries
        .filter(([, value]) => !value.trim())
        .map(([key]) => key);

      if (removableAttributes.length > 0) {
        component.removeAttributes(removableAttributes);
      }

      const appliedAttributes = Object.fromEntries(
        attributeEntries.filter(([, value]) => value.trim()),
      );
      if (Object.keys(appliedAttributes).length > 0) {
        component.addAttributes(appliedAttributes);
      }

      syncSelectedComponent(editor);
      return true;
    },
    [syncSelectedComponent],
  );

  const insertImage = useCallback((imageUrl: string): boolean => {
    const component = selectedComponentRef.current;
    const editor = editorRef.current;
    const normalizedImageUrl = imageUrl.trim();
    if (!component || !editor || !normalizedImageUrl) return false;

    const parentComponent = component.parent();
    if (!parentComponent) return false;

    const [nextComponent] = parentComponent.append(
      `<img src="${escapeHtmlAttribute(normalizedImageUrl)}" alt="" />`,
      {
        at: component.index() + 1,
      },
    );

    if (nextComponent) {
      editor.select(nextComponent);
    }
    scheduleSelectionSync();
    return true;
  }, [scheduleSelectionSync]);

  const replaceImageSource = useCallback((component: Component, imageUrl: string): boolean => {
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedImageUrl) return false;
    if (!isImageLikeComponent(component)) return false;

    component.addAttributes({
      src: normalizedImageUrl,
    });
    return true;
  }, []);

  const applyImageFromPicker = useCallback((imageUrl: string): boolean => {
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedImageUrl) {
      emitImagePickerDebug('apply-skipped-empty-url');
      return false;
    }

    const editor = editorRef.current;
    if (!editor) {
      emitImagePickerDebug('apply-skipped-no-editor');
      return false;
    }

    const pickerMode = imagePickerState.mode;
    const targetComponentId = imagePickerTargetComponentIdRef.current;
    if (pickerMode === 'replace' && targetComponentId) {
      const targetComponent = resolveComponentById(editor, targetComponentId);
      if (targetComponent && replaceImageSource(targetComponent, normalizedImageUrl)) {
        emitImagePickerDebug('apply-replace-success', {
          componentId: targetComponent.getId(),
          imageUrl: normalizedImageUrl,
        });
        editor.select(targetComponent);
        closeImagePicker();
        scheduleSelectionSync();
        return true;
      }
      emitImagePickerDebug('apply-replace-fallback-to-insert', {
        targetComponentId,
        imageUrl: normalizedImageUrl,
      });
    }

    const inserted = insertImage(normalizedImageUrl);
    if (inserted) {
      emitImagePickerDebug('apply-insert-success', {
        imageUrl: normalizedImageUrl,
      });
      closeImagePicker();
    } else {
      emitImagePickerDebug('apply-insert-failed', {
        imageUrl: normalizedImageUrl,
      });
    }
    return inserted;
  }, [closeImagePicker, imagePickerState.mode, insertImage, replaceImageSource, scheduleSelectionSync]);

  const setLink = useCallback((url: string): boolean => {
    const component = selectedComponentRef.current;
    const currentSelection = selectionRef.current;
    if (!component) return false;
    if (component.tagName.trim().toLowerCase() !== 'a' && !currentSelection?.href) {
      return false;
    }

    return updateSelectionAttributes({
      href: url,
    });
  }, [updateSelectionAttributes]);

  const clearLink = useCallback(() => {
    return updateSelectionAttributes({
      href: '',
    });
  }, [updateSelectionAttributes]);

  const openImagePicker = useCallback((): boolean => {
    const selectedComponent = selectedComponentRef.current;
    if (selectedComponent && isImageLikeComponent(selectedComponent)) {
      emitImagePickerDebug('toolbar-image-action', {
        branch: 'replace',
        selectedComponentId: selectedComponent.getId(),
        selectedTagName: selectedComponent.tagName,
      });
      return openImagePickerForReplace(selectedComponent);
    }
    emitImagePickerDebug('toolbar-image-action', {
      branch: 'insert',
      selectedComponentId: selectedComponent?.getId() ?? '',
      selectedTagName: selectedComponent?.tagName ?? '',
    });
    return openImagePickerForInsert();
  }, [openImagePickerForInsert, openImagePickerForReplace]);

  const selectParent = useCallback((): boolean => {
    const component = selectedComponentRef.current;
    const editor = editorRef.current;
    if (!component || !editor) return false;

    const parentComponent = component.parent();
    if (!parentComponent) return false;

    editor.select(parentComponent);
    scheduleSelectionSync();
    return true;
  }, [scheduleSelectionSync]);

  const duplicateSelection = useCallback((): boolean => {
    const component = selectedComponentRef.current;
    const editor = editorRef.current;
    if (!component || !editor) return false;

    const parentComponent = component.parent();
    if (!parentComponent) return false;

    const nextComponent = component.clone();
    parentComponent.append(nextComponent, {
      at: component.index() + 1,
    });
    editor.select(nextComponent);
    scheduleSelectionSync();
    return true;
  }, [scheduleSelectionSync]);

  const deleteSelection = useCallback((): boolean => {
    const component = selectedComponentRef.current;
    const editor = editorRef.current;
    if (!component || !editor) return false;

    const parentComponent = component.parent() ?? null;
    component.remove();

    if (parentComponent) {
      editor.select(parentComponent);
    } else {
      editor.select();
    }
    scheduleSelectionSync();
    return true;
  }, [scheduleSelectionSync]);

  const openAiTool = useCallback((): boolean => {
    return true;
  }, []);

  const addBlock = useCallback((selection?: HandbookAddBlockSelection): boolean => {
    const component = selectedComponentRef.current;
    const editor = editorRef.current;
    if (!component || !editor) return false;

    const parentComponent = component.parent();
    if (!parentComponent) return false;

    const resolvedSelection = resolveHandbookAddBlockSelection(selection);
    const insertAt =
      resolvedSelection.insertPosition === 'before'
        ? component.index()
        : component.index() + 1;
    const markup = buildHandbookAddBlockMarkup(resolvedSelection.elementType);
    const [nextComponent] = parentComponent.append(markup, {
      at: insertAt,
    });
    if (nextComponent) {
      editor.select(nextComponent);
    }
    scheduleSelectionSync();
    return Boolean(nextComponent);
  }, [scheduleSelectionSync]);

  const dragToMove = useCallback((): boolean => {
    const component = selectedComponentRef.current;
    const editor = editorRef.current;
    if (!component || !editor) return false;

    const commandCandidates = ['tlb-move', 'core:component-drag', 'component-drag'];
    const commandsApi = editor.Commands as {
      has?: (commandName: string) => boolean;
    };

    for (const commandName of commandCandidates) {
      try {
        if (commandsApi.has && !commandsApi.has(commandName)) continue;
        editor.runCommand(commandName, {
          target: component,
          component,
        });
        scheduleSelectionSync();
        return true;
      } catch {
        // Continue to the next fallback command.
      }
    }

    scheduleSelectionSync();
    return true;
  }, [scheduleSelectionSync]);

  const toggleBold = useCallback((): boolean => {
    const currentSelection = selectionRef.current;
    const currentFontWeight = currentSelection?.styles['font-weight'] ?? '';
    const isActive = isBoldStyleValue(currentFontWeight);
    return applyStylePatchToSelectedComponent({
      'font-weight': isActive ? '400' : '700',
    });
  }, [applyStylePatchToSelectedComponent]);

  const toggleItalic = useCallback((): boolean => {
    const currentSelection = selectionRef.current;
    const currentFontStyle = currentSelection?.styles['font-style'] ?? '';
    const isActive = isItalicStyleValue(currentFontStyle);
    return applyStylePatchToSelectedComponent({
      'font-style': isActive ? 'normal' : 'italic',
    });
  }, [applyStylePatchToSelectedComponent]);

  const toggleUnderline = useCallback((): boolean => {
    const currentSelection = selectionRef.current;
    const currentTextDecoration = currentSelection?.textDecoration ?? '';
    const nextTextDecoration =
      toggleHandbookTextDecorationValue(currentTextDecoration, 'underline') || 'none';
    return applyStylePatchToSelectedComponent({
      'text-decoration': nextTextDecoration,
    });
  }, [applyStylePatchToSelectedComponent]);

  const toggleStrike = useCallback((): boolean => {
    const currentSelection = selectionRef.current;
    const currentTextDecoration = currentSelection?.textDecoration ?? '';
    const nextTextDecoration =
      toggleHandbookTextDecorationValue(currentTextDecoration, 'line-through') || 'none';
    return applyStylePatchToSelectedComponent({
      'text-decoration': nextTextDecoration,
    });
  }, [applyStylePatchToSelectedComponent]);

  const textToolbarActions = useRef<HandbookTextToolbarActions>({
    openImagePicker,
    setLink,
    clearLink,
    setColor: value => applyStylePatchToSelectedComponent({ color: value }),
    setFontSize: value => applyStylePatchToSelectedComponent({ 'font-size': value }),
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrike,
  });

  const blockToolbarActions = useRef<HandbookBlockToolbarActions>({
    openAiTool,
    addBlock,
    selectParent,
    dragToMove,
    duplicateSelection,
    deleteSelection,
  });

  useEffect(() => {
    textToolbarActions.current = {
      openImagePicker,
      setLink,
      clearLink,
      setColor: value => applyStylePatchToSelectedComponent({ color: value }),
      setFontSize: value => applyStylePatchToSelectedComponent({ 'font-size': value }),
      toggleBold,
      toggleItalic,
      toggleUnderline,
      toggleStrike,
    };
  }, [
    applyStylePatchToSelectedComponent,
    clearLink,
    openImagePicker,
    setLink,
    toggleBold,
    toggleItalic,
    toggleStrike,
    toggleUnderline,
  ]);

  useEffect(() => {
    blockToolbarActions.current = {
      openAiTool,
      addBlock,
      selectParent,
      dragToMove,
      duplicateSelection,
      deleteSelection,
    };
  }, [addBlock, deleteSelection, dragToMove, duplicateSelection, openAiTool, selectParent]);

  useEffect(() => {
    return () => {
      if (revealExternalDocumentTimerRef.current !== null) {
        window.clearTimeout(revealExternalDocumentTimerRef.current);
      }
      if (selectionSyncRafRef.current !== null) {
        window.cancelAnimationFrame(selectionSyncRafRef.current);
      }
      if (hoverSyncRafRef.current !== null) {
        window.cancelAnimationFrame(hoverSyncRafRef.current);
      }
      if (documentChangeRafRef.current !== null) {
        window.cancelAnimationFrame(documentChangeRafRef.current);
      }
      pendingDocumentHtmlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!container) return;
    if (editorRef.current) return;

    let isCancelled = false;
    let detachFrameViewportListeners = () => {};
    let detachFrameHoverListeners = () => {};
    let detachCanvasOverlayListeners = () => {};
    const detachCanvasLayoutStyles = ensureGrapesJsCanvasLayoutStyles();

    const releaseExternalApplyGuard = () => {
      if (revealExternalDocumentTimerRef.current !== null) {
        window.clearTimeout(revealExternalDocumentTimerRef.current);
      }
      revealExternalDocumentTimerRef.current = window.setTimeout(() => {
        applyingExternalDocumentRef.current = false;
        revealExternalDocumentTimerRef.current = null;
      }, 0);
    };

    const syncEditorFromDocument = (editor: Editor, nextDocumentHtml: string) => {
      const extractedInput = extractHandbookEditorInput(nextDocumentHtml);
      documentShellRef.current = extractedInput.documentShell;
      lastSyncedDocumentHtmlRef.current = nextDocumentHtml;
      applyingExternalDocumentRef.current = true;
      editor.setComponents(extractedInput.bodyHtml);
      editor.setStyle(extractedInput.cssText);
      releaseExternalApplyGuard();
    };

    const attachFrameViewportListeners = (frameWindow: Window | null | undefined) => {
      detachFrameViewportListeners();
      if (!frameWindow) return;

      const handleViewportChange = () => {
        scheduleSelectionSync();
        const hoveredElement = hoveredElementRef.current;
        if (hoveredElement) {
          scheduleHoverHighlightSync(hoveredElement);
        }
      };

      frameWindow.addEventListener('scroll', handleViewportChange, { passive: true });
      frameWindow.addEventListener('resize', handleViewportChange);

      detachFrameViewportListeners = () => {
        frameWindow.removeEventListener('scroll', handleViewportChange);
        frameWindow.removeEventListener('resize', handleViewportChange);
      };
    };

    const resolveHoverCandidateFromTarget = (target: EventTarget | null): HTMLElement | null => {
      if (!target || typeof target !== 'object') return null;
      const node = target as Node;
      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? node as Element
          : node.parentElement;
      if (!element) return null;

      const candidate = element as HTMLElement;
      const normalizedTagName = candidate.tagName.trim().toLowerCase();
      if (!normalizedTagName || normalizedTagName === 'html' || normalizedTagName === 'body') {
        return null;
      }
      return candidate;
    };

    const attachFrameHoverListeners = (frameWindow: Window | null | undefined) => {
      detachFrameHoverListeners();
      if (!frameWindow) return;
      const frameDocument = frameWindow.document;
      if (!frameDocument) return;

      const tryOpenImagePickerByComponent = (
        component: Component | null,
        source: string,
        event?: MouseEvent,
      ): boolean => {
        if (!component) {
          emitImagePickerDebug(`${source}-skipped-no-component`);
          return false;
        }
        if (!isImageLikeComponent(component)) {
          emitImagePickerDebug(`${source}-skipped-non-image`, {
            componentId: component.getId(),
            tagName: component.tagName,
            componentType: component.getType(),
          });
          return false;
        }
        if (imagePickerOpenRef.current) {
          emitImagePickerDebug(`${source}-skipped-already-open`, {
            componentId: component.getId(),
          });
          return false;
        }

        event?.preventDefault();
        event?.stopPropagation();
        const opened = openImagePickerForReplace(component);
        emitImagePickerDebug(`${source}-open-result`, {
          componentId: component.getId(),
          opened,
        });
        scheduleSelectionSync();
        return opened;
      };

      const syncFromTarget = (target: EventTarget | null) => {
        const candidate = resolveHoverCandidateFromTarget(target);
        if (!candidate) {
          clearHoverHighlight();
          return;
        }
        scheduleHoverHighlightSync(candidate);
      };

      const handleMouseMove = (event: MouseEvent) => {
        syncFromTarget(event.target);
      };

      const handleMouseOver = (event: MouseEvent) => {
        syncFromTarget(event.target);
      };

      const handleMouseLeave = () => {
        clearHoverHighlight();
      };

      const handleClick = (event: MouseEvent) => {
        const editor = editorRef.current;
        if (!editor) {
          textToolbarComponentIdRef.current = null;
          savedTextRangeRef.current = null;
          scheduleSelectionSync();
          return;
        }

        const candidate = resolveHoverCandidateFromTarget(event.target);
        if (!textToolbarComponentIdRef.current) return;

        if (candidate) {
          const component = resolveComponentFromElement(editor, candidate);
          if (component) {
            if (isSameOrDescendantComponent(component, textToolbarComponentIdRef.current)) return;
          }
        }

        textToolbarComponentIdRef.current = null;
        savedTextRangeRef.current = null;
        scheduleSelectionSync();
      };

      const handleDoubleClick = (event: MouseEvent) => {
        const candidate = resolveHoverCandidateFromTarget(event.target);
        const editor = editorRef.current;
        if (!candidate || !editor) return;
        emitImagePickerDebug('frame-dblclick', {
          candidateTag: candidate.tagName.toLowerCase(),
          candidateClass: candidate.className || '',
        });

        const imageCandidateElement = candidate.closest<HTMLElement>('img,picture,svg,canvas,video');
        const imageCandidateComponent = imageCandidateElement
          ? resolveComponentFromElement(editor, imageCandidateElement)
          : null;
        if (imageCandidateComponent && isImageLikeComponent(imageCandidateComponent)) {
          emitImagePickerDebug('frame-dblclick-direct-image-branch', {
            componentId: imageCandidateComponent.getId(),
            tagName: imageCandidateComponent.tagName,
            componentType: imageCandidateComponent.getType(),
          });
          if (tryOpenImagePickerByComponent(imageCandidateComponent, 'frame-dblclick-direct-image', event)) {
            return;
          }
        }

        const textCandidateElement = candidate.closest<HTMLElement>(TEXT_TOOLBAR_DOM_SELECTOR);
        const textCandidateComponent = textCandidateElement
          ? resolveComponentFromElement(editor, textCandidateElement)
          : null;
        if (textCandidateComponent && isTextLikeComponent(textCandidateComponent)) {
          editor.select(textCandidateComponent);
          textToolbarComponentIdRef.current = textCandidateComponent.getId();
          if (textCandidateElement) {
            selectPlainTextContentForEditing(editor, textCandidateComponent, textCandidateElement);
          }
          syncSelectedComponent(editor);
          rememberActiveTextRange(editor.Canvas.getWindow());
          return;
        }

        const component = resolveComponentFromElement(editor, candidate);
        if (!component) return;

        const selectedComponent = editor.getSelected() ?? selectedComponentRef.current;
        const preferredImageTarget =
          (isImageLikeComponent(component) ? component : findImageLikeDescendant(component))
          ?? (selectedComponent && isImageLikeComponent(selectedComponent)
            ? selectedComponent
            : null);
        if (preferredImageTarget) {
          emitImagePickerDebug('frame-dblclick-image-priority-branch', {
            candidateTag: candidate.tagName.toLowerCase(),
            componentId: preferredImageTarget.getId(),
            tagName: preferredImageTarget.tagName,
            componentType: preferredImageTarget.getType(),
          });
          if (tryOpenImagePickerByComponent(preferredImageTarget, 'frame-dblclick-image-priority', event)) {
            return;
          }
        }

        const textDescendantComponent = isTextLikeComponent(component)
          ? component
          : findTextLikeDescendant(component);
        if (textDescendantComponent && isTextLikeComponent(textDescendantComponent)) {
          const textComponentElement =
            textDescendantComponent.getEl(editor.Canvas.getFrame())
            ?? textDescendantComponent.getEl();
          editor.select(textDescendantComponent);
          textToolbarComponentIdRef.current = textDescendantComponent.getId();
          if (textComponentElement instanceof HTMLElement) {
            selectPlainTextContentForEditing(
              editor,
              textDescendantComponent,
              textComponentElement,
            );
          }
          syncSelectedComponent(editor);
          rememberActiveTextRange(editor.Canvas.getWindow());
          return;
        }

        editor.select(component);

        if (isImageLikeComponent(component)) {
          emitImagePickerDebug('frame-dblclick-image-branch', {
            componentId: component.getId(),
            tagName: component.tagName,
            componentType: component.getType(),
          });
          if (tryOpenImagePickerByComponent(component, 'frame-dblclick-image', event)) return;
        }

        if (isTextLikeComponent(component)) {
          textToolbarComponentIdRef.current = component.getId();
          selectPlainTextContentForEditing(editor, component, candidate);
          syncSelectedComponent(editor);
          rememberActiveTextRange(editor.Canvas.getWindow());
          return;
        }

        textToolbarComponentIdRef.current = null;
        savedTextRangeRef.current = null;
        syncSelectedComponent(editor);
      };

      const handleSelectionChange = () => {
        rememberActiveTextRange(frameWindow);
      };

      frameDocument.addEventListener('mousemove', handleMouseMove, { passive: true });
      frameDocument.addEventListener('mouseover', handleMouseOver, { passive: true });
      frameDocument.addEventListener('mouseleave', handleMouseLeave);
      frameDocument.addEventListener('selectionchange', handleSelectionChange);
      frameDocument.addEventListener('mouseup', handleSelectionChange);
      frameDocument.addEventListener('keyup', handleSelectionChange);
      frameDocument.addEventListener('click', handleClick, true);
      frameDocument.addEventListener('dblclick', handleDoubleClick, true);
      frameWindow.addEventListener('blur', handleMouseLeave);
      emitImagePickerDebug('frame-hover-listeners-attached');

      detachFrameHoverListeners = () => {
        frameDocument.removeEventListener('mousemove', handleMouseMove);
        frameDocument.removeEventListener('mouseover', handleMouseOver);
        frameDocument.removeEventListener('mouseleave', handleMouseLeave);
        frameDocument.removeEventListener('selectionchange', handleSelectionChange);
        frameDocument.removeEventListener('mouseup', handleSelectionChange);
        frameDocument.removeEventListener('keyup', handleSelectionChange);
        frameDocument.removeEventListener('click', handleClick, true);
        frameDocument.removeEventListener('dblclick', handleDoubleClick, true);
        frameWindow.removeEventListener('blur', handleMouseLeave);
      };
    };

    const attachCanvasOverlayListeners = (canvasHost: HTMLElement | null | undefined) => {
      detachCanvasOverlayListeners();
      if (!canvasHost) return;

      const resolveImageComponentFromPointerEvent = (
        source: string,
        event: MouseEvent,
      ): Component | null => {
        const editor = editorRef.current;
        if (!editor) {
          emitImagePickerDebug(`${source}-skipped-no-editor`);
          return null;
        }

        const frameWindow = editor.Canvas.getWindow();
        const frameDocument = frameWindow?.document ?? null;
        const frameElement = editor.Canvas.getFrameEl();
        if (!frameDocument || !frameElement) {
          emitImagePickerDebug(`${source}-skipped-no-frame`);
          return null;
        }

        const frameRect = frameElement.getBoundingClientRect();
        const framePointX = event.clientX - frameRect.left;
        const framePointY = event.clientY - frameRect.top;
        const outsideFrameBounds =
          framePointX < 0
          || framePointY < 0
          || framePointX > frameRect.width
          || framePointY > frameRect.height;
        if (outsideFrameBounds) {
          emitImagePickerDebug(`${source}-skipped-outside-frame`, {
            clientX: event.clientX,
            clientY: event.clientY,
            framePointX,
            framePointY,
            frameWidth: frameRect.width,
            frameHeight: frameRect.height,
          });
          return null;
        }

        const pointerTargetElement = frameDocument.elementFromPoint(
          framePointX,
          framePointY,
        ) as HTMLElement | null;
        if (!pointerTargetElement) {
          emitImagePickerDebug(`${source}-skipped-no-pointer-target`);
          return null;
        }

        const pointerTargetTagName = pointerTargetElement.tagName.toLowerCase();
        if (pointerTargetTagName === 'html' || pointerTargetTagName === 'body') {
          emitImagePickerDebug(`${source}-skipped-root-pointer-target`, {
            pointerTargetTagName,
          });
          return null;
        }

        const resolvedComponent = resolveComponentFromElement(editor, pointerTargetElement);
        if (!resolvedComponent) {
          emitImagePickerDebug(`${source}-skipped-unmapped-component`, {
            pointerTargetTagName,
            pointerTargetClass: pointerTargetElement.className || '',
          });
          return null;
        }

        const imageComponent =
          (isImageLikeComponent(resolvedComponent) ? resolvedComponent : findImageLikeDescendant(resolvedComponent))
          ?? (() => {
            let currentParent = resolvedComponent.parent();
            while (currentParent) {
              if (isImageLikeComponent(currentParent)) return currentParent;
              currentParent = currentParent.parent();
            }
            return null;
          })();

        if (!imageComponent) {
          emitImagePickerDebug(`${source}-skipped-non-image`, {
            componentId: resolvedComponent.getId(),
            tagName: resolvedComponent.tagName,
            componentType: resolvedComponent.getType(),
            pointerTargetTagName,
            pointerTargetClass: pointerTargetElement.className || '',
          });
          return null;
        }

        emitImagePickerDebug(`${source}-resolved-image-component`, {
          componentId: imageComponent.getId(),
          tagName: imageComponent.tagName,
          componentType: imageComponent.getType(),
          pointerTargetTagName,
          pointerTargetClass: pointerTargetElement.className || '',
        });
        return imageComponent;
      };

      const tryOpenByPointerEvent = (
        source: string,
        event: MouseEvent,
      ): boolean => {
        if (imagePickerOpenRef.current) {
          emitImagePickerDebug(`${source}-skipped-already-open`);
          return false;
        }

        const imageComponent = resolveImageComponentFromPointerEvent(source, event);
        if (!imageComponent) return false;

        event.preventDefault();
        event.stopPropagation();
        const opened = openImagePickerForReplace(imageComponent);
        emitImagePickerDebug(`${source}-open-result`, {
          componentId: imageComponent.getId(),
          opened,
        });
        if (opened) {
          scheduleSelectionSync();
        }
        return opened;
      };

      const tryOpenBySelectedComponent = (
        source: string,
        event: MouseEvent,
      ): boolean => {
        if (imagePickerOpenRef.current) {
          emitImagePickerDebug(`${source}-skipped-already-open`);
          return false;
        }
        const editor = editorRef.current;
        if (!editor) {
          emitImagePickerDebug(`${source}-skipped-no-editor`);
          return false;
        }

        const selectedComponent = editor.getSelected() ?? selectedComponentRef.current;
        if (!selectedComponent) {
          emitImagePickerDebug(`${source}-skipped-no-selected-component`);
          return false;
        }

        if (!isImageLikeComponent(selectedComponent)) {
          emitImagePickerDebug(`${source}-skipped-non-image`, {
            componentId: selectedComponent.getId(),
            tagName: selectedComponent.tagName,
            componentType: selectedComponent.getType(),
          });
          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        const opened = openImagePickerForReplace(selectedComponent);
        emitImagePickerDebug(`${source}-open-result`, {
          componentId: selectedComponent.getId(),
          opened,
        });
        scheduleSelectionSync();
        return opened;
      };

      const tryOpenBySelectedComponentDeferred = (source: string): void => {
        window.requestAnimationFrame(() => {
          if (imagePickerOpenRef.current) {
            emitImagePickerDebug(`${source}-deferred-skipped-already-open`);
            return;
          }

          const editor = editorRef.current;
          if (!editor) {
            emitImagePickerDebug(`${source}-deferred-skipped-no-editor`);
            return;
          }

          const selectedComponent = editor.getSelected() ?? selectedComponentRef.current;
          if (!selectedComponent) {
            emitImagePickerDebug(`${source}-deferred-skipped-no-selected-component`);
            return;
          }

          if (!isImageLikeComponent(selectedComponent)) {
            emitImagePickerDebug(`${source}-deferred-skipped-non-image`, {
              componentId: selectedComponent.getId(),
              tagName: selectedComponent.tagName,
              componentType: selectedComponent.getType(),
            });
            return;
          }

          const opened = openImagePickerForReplace(selectedComponent);
          emitImagePickerDebug(`${source}-deferred-open-result`, {
            componentId: selectedComponent.getId(),
            opened,
          });
          if (opened) {
            scheduleSelectionSync();
          }
        });
      };

      const handleCanvasOverlayDoubleClick = (event: MouseEvent) => {
        const targetElement = event.target instanceof Element ? event.target : null;
        if (!targetElement) return;

        const canvasRoot = targetElement.closest('.gjs-cv-canvas');
        if (!canvasRoot) return;

        const overlayTarget = targetElement.closest(
          '.gjs-resizer-c, .gjs-toolbar, #gjs-tools, #gjs-cv-tools, .gjs-tools, .gjs-cv-tools',
        );
        if (!overlayTarget) return;

        emitImagePickerDebug('canvas-overlay-dblclick', {
          targetTag: targetElement.tagName.toLowerCase(),
          targetClass: targetElement.className || '',
          overlayClass: (overlayTarget as HTMLElement).className || '',
          detail: event.detail,
        });

        const openedByPointer = tryOpenByPointerEvent('canvas-overlay-dblclick-pointer', event);
        if (openedByPointer) return;

        const opened = tryOpenBySelectedComponent('canvas-overlay-dblclick', event);
        if (!opened) {
          emitImagePickerDebug('canvas-overlay-dblclick-deferred-scheduled');
          tryOpenBySelectedComponentDeferred('canvas-overlay-dblclick');
        }
      };

      const handleCanvasOverlayClick = (event: MouseEvent) => {
        if (event.detail < 2) return;
        const targetElement = event.target instanceof Element ? event.target : null;
        if (!targetElement) return;
        const canvasRoot = targetElement.closest('.gjs-cv-canvas');
        if (!canvasRoot) return;
        const overlayTarget = targetElement.closest(
          '.gjs-resizer-c, .gjs-toolbar, #gjs-tools, #gjs-cv-tools, .gjs-tools, .gjs-cv-tools',
        );
        if (!overlayTarget) return;
        emitImagePickerDebug('canvas-overlay-click-double', {
          targetTag: targetElement.tagName.toLowerCase(),
          targetClass: targetElement.className || '',
          overlayClass: (overlayTarget as HTMLElement).className || '',
          detail: event.detail,
        });

        const openedByPointer = tryOpenByPointerEvent('canvas-overlay-click-double-pointer', event);
        if (openedByPointer) return;

        const opened = tryOpenBySelectedComponent('canvas-overlay-click-double', event);
        if (!opened) {
          emitImagePickerDebug('canvas-overlay-click-double-deferred-scheduled');
          tryOpenBySelectedComponentDeferred('canvas-overlay-click-double');
        }
      };

      canvasHost.addEventListener('click', handleCanvasOverlayClick, true);
      canvasHost.addEventListener('dblclick', handleCanvasOverlayDoubleClick, true);
      emitImagePickerDebug('canvas-overlay-listeners-attached');

      detachCanvasOverlayListeners = () => {
        canvasHost.removeEventListener('click', handleCanvasOverlayClick, true);
        canvasHost.removeEventListener('dblclick', handleCanvasOverlayDoubleClick, true);
      };
    };

    const initializeEditor = async () => {
      try {
        const grapesjs = (await import('grapesjs')).default;
        if (isCancelled) return;

        const editor = grapesjs.init({
          container,
          fromElement: false,
          storageManager: false,
          height: '100%',
          width: 'auto',
          panels: { defaults: [] },
          blockManager: { appendTo: undefined },
        });

        editorRef.current = editor;
        syncEditorFromDocument(editor, documentHtmlRef.current);
        syncSelectedComponent(editor);
        attachFrameViewportListeners(editor.Canvas.getWindow());
        attachFrameHoverListeners(editor.Canvas.getWindow());
        attachCanvasOverlayListeners(container);

        const handleViewportChange = () => {
          scheduleSelectionSync();
          const hoveredElement = hoveredElementRef.current;
          if (hoveredElement) {
            scheduleHoverHighlightSync(hoveredElement);
          }
        };

        editor.on('component:select', () => {
          syncSelectedComponent(editor);
        });
        editor.on('component:deselect', () => {
          syncSelectedComponent(editor);
        });
        editor.on('canvas:frame:load', ({ window: frameWindow }: { window: Window }) => {
          attachFrameViewportListeners(frameWindow);
          attachFrameHoverListeners(frameWindow);
          scheduleSelectionSync();
        });
        editor.on('canvas:frame:unload', () => {
          detachFrameViewportListeners();
          detachFrameHoverListeners();
          clearHoverHighlight();
        });

        editor.on('update', () => {
          if (applyingExternalDocumentRef.current) return;
          if (!documentShellRef.current) return;

          const nextDocumentHtml = buildHandbookHtml({
            documentShell: documentShellRef.current,
            bodyHtml: editor.getHtml(),
            cssText: editor.getCss() ?? '',
          });

          lastSyncedDocumentHtmlRef.current = nextDocumentHtml;
          publishDocumentChange(nextDocumentHtml);
        });

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        setIsReady(true);
        setErrorMessage(null);

        return () => {
          window.removeEventListener('resize', handleViewportChange);
          window.removeEventListener('scroll', handleViewportChange, true);
          detachFrameViewportListeners();
          detachFrameHoverListeners();
          detachCanvasOverlayListeners();
          clearHoverHighlight();
        };
      } catch (error) {
        if (isCancelled) return;
        console.error('[handbook-visual-editor] init-failed', error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Failed to initialize visual editor.',
        );
      }
    };

    let cleanupEditorListeners: (() => void) | undefined;
    void initializeEditor().then(cleanup => {
      cleanupEditorListeners = cleanup;
    });

    return () => {
      isCancelled = true;
      cleanupEditorListeners?.();
      detachCanvasLayoutStyles();
      detachCanvasOverlayListeners();
      if (revealExternalDocumentTimerRef.current !== null) {
        window.clearTimeout(revealExternalDocumentTimerRef.current);
        revealExternalDocumentTimerRef.current = null;
      }
      if (selectionSyncRafRef.current !== null) {
        window.cancelAnimationFrame(selectionSyncRafRef.current);
        selectionSyncRafRef.current = null;
      }
      if (hoverSyncRafRef.current !== null) {
        window.cancelAnimationFrame(hoverSyncRafRef.current);
        hoverSyncRafRef.current = null;
      }
      if (documentChangeRafRef.current !== null) {
        window.cancelAnimationFrame(documentChangeRafRef.current);
        documentChangeRafRef.current = null;
      }
      pendingDocumentHtmlRef.current = null;
      editorRef.current?.destroy();
      editorRef.current = null;
      hoveredElementRef.current = null;
      selectedStyleTargetRef.current = null;
      selectedComponentRef.current = null;
      savedTextRangeRef.current = null;
      imagePickerTargetComponentIdRef.current = null;
      publishSelection(null);
      setCanvasRect(null);
      setHoverHighlight(null);
      setImagePickerState({
        open: false,
        mode: 'insert',
        currentImageUrl: '',
      });
      setIsReady(false);
    };
  }, [
    clearHoverHighlight,
    container,
    publishDocumentChange,
    publishSelection,
    scheduleHoverHighlightSync,
    scheduleSelectionSync,
    syncSelectedComponent,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (documentHtml === lastSyncedDocumentHtmlRef.current) return;

    const extractedInput = extractHandbookEditorInput(documentHtml);
    documentShellRef.current = extractedInput.documentShell;
    lastSyncedDocumentHtmlRef.current = documentHtml;
    applyingExternalDocumentRef.current = true;
    savedTextRangeRef.current = null;
    imagePickerTargetComponentIdRef.current = null;
    setImagePickerState({
      open: false,
      mode: 'insert',
      currentImageUrl: '',
    });
    editor.setComponents(extractedInput.bodyHtml);
    editor.setStyle(extractedInput.cssText);

    if (revealExternalDocumentTimerRef.current !== null) {
      window.clearTimeout(revealExternalDocumentTimerRef.current);
    }
    revealExternalDocumentTimerRef.current = window.setTimeout(() => {
      applyingExternalDocumentRef.current = false;
      revealExternalDocumentTimerRef.current = null;
    }, 0);
    syncSelectedComponent(editor);
  }, [documentHtml, syncSelectedComponent]);

  return {
    errorMessage,
    isReady,
    canvasRect,
    selection,
    hoverHighlight,
    imagePickerState,
    applySelectionStyle,
    applyImageFromPicker,
    closeImagePicker,
    textToolbarActions: textToolbarActions.current,
    blockToolbarActions: blockToolbarActions.current,
  };
}
