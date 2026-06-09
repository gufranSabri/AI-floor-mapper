import React from 'react';
import { makeLine } from '../../konva/walls/wallUtils';

const MODE_BUTTONS = [
  { key: 'pan',        label: 'Pan',         icon: '✋', kbd: 'A' },
  { key: 'select',     label: 'Select',      icon: '✦', kbd: 'S' },
  { key: 'line',       label: 'Draw Wall',   icon: '╱', kbd: 'D' },
  { key: 'connect',    label: 'Connect',     icon: '⟡', kbd: 'C' },
  { key: 'split',      label: 'Split',       icon: '⌥', kbd: 'X' },
  { key: 'disconnect', label: 'Disconnect',  icon: '✂', kbd: 'V' },
  { key: 'merge',      label: 'Merge',       icon: '⊕', kbd: 'M' },
];

const STATUS_MAP = {
  pan:        ()         => 'Drag to pan · scroll to zoom',
  select:     (sel, buf) => sel ? 'Shape selected — drag to move, Del to delete' : 'Click a wall to select it',
  line:       ()         => 'Click to place the first endpoint, click again to finish',
  connect:    (sel, buf) => buf ? 'Now click a second endpoint to snap & connect' : 'Click any endpoint to start a connection',
  split:      ()         => 'Hover over a wall and click to split it in two',
  disconnect: ()         => 'Click a connected endpoint (shown in orange) to disconnect',
  merge:      (sel, buf, merge) => merge
    ? 'Now click a second wall — the shorter one will be removed'
    : 'Click the first wall to merge (shorter wall will be deleted)',
};

export default function EditorToolbar({ state, actions, canvasSize, canUndo, canRedo, onUndo, onRedo }) {
  const { mode, selectedId, shapes, connectBuffer, mergeBuffer } = state;
  const { setMode, addShape, deleteShape, clearAll, deselect } = actions;

  const isDeleteMode = mode === 'delete';

  const status = STATUS_MAP[mode]?.(selectedId, connectBuffer, mergeBuffer) ?? '';

  return (
    <div className="editor-toolbar">
      {/* History group */}
      <div className="editor-toolbar__group">
        <button
          type="button"
          className="editor-btn"
          onClick={onUndo}
          disabled={isDeleteMode || !canUndo}
          title="Undo (Cmd+Z / Ctrl+Z)"
        >
          ↩ Undo <span className="editor-btn__kbd">(⌘Z)</span>
        </button>
        <button
          type="button"
          className="editor-btn"
          onClick={onRedo}
          disabled={isDeleteMode || !canRedo}
          title="Redo (Cmd+Y / Ctrl+Y)"
        >
          ↪ Redo <span className="editor-btn__kbd">(⌘Y)</span>
        </button>
      </div>

      {/* Mode group */}
      <div className="editor-toolbar__group">
        {MODE_BUTTONS.map(({ key, label, icon, kbd }) => (
          <button
            key={key}
            type="button"
            className={`editor-btn${mode === key ? ' editor-btn--active' : ''}`}
            onClick={() => setMode(key)}
            disabled={isDeleteMode}
            title={`${label} (${kbd})`}
          >
            <span className="editor-btn__icon">{icon}</span>
            {label} <span className="editor-btn__kbd">({kbd})</span>
          </button>
        ))}
      </div>

      {/* Edit group */}
      <div className="editor-toolbar__group">
        <span className="editor-toolbar__label">Edit</span>
        <button
          type="button"
          className={`editor-btn editor-btn--danger${isDeleteMode ? ' editor-btn--active' : ''}`}
          onClick={() => setMode(isDeleteMode ? 'select' : 'delete')}
          title="Delete mode (Del)"
        >
          ✕ Delete <span className="editor-btn__kbd">(Del)</span>
        </button>
        <button
          type="button"
          className="editor-btn editor-btn--danger"
          onClick={clearAll}
          disabled={isDeleteMode}
        >
          ⊘ Clear All
        </button>
      </div>

      {/* Status hint */}
      {/* <span className="editor-toolbar__status">{status}</span> */}
    </div>
  );
}
