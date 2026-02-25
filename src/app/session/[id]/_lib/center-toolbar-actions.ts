export const CENTER_TOOLBAR_ACTION_EVENT = 'tabi:center-toolbar-action';

export type CenterToolbarAction = 'export' | 'save' | 'generate';

export interface CenterToolbarActionDetail {
  sessionId: string;
  action: CenterToolbarAction;
}
