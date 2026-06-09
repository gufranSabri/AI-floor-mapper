import React from 'react';
import '../WallEditor/FloorEditor.css';

export default function DoorToolbar({ mode, setMode, canUndo, canRedo, onUndo, onRedo }) {
  const isDelete = mode === 'delete';

  return (
    <div className="editor-toolbar">
      {/* History */}
      <div className="editor-toolbar__group">
        <button
          type="button" className="editor-btn"
          onClick={onUndo} disabled={isDelete || !canUndo}
          title="Undo (Cmd+Z)"
        >
          ↩ Undo <span className="editor-btn__kbd">(⌘Z)</span>
        </button>
        <button
          type="button" className="editor-btn"
          onClick={onRedo} disabled={isDelete || !canRedo}
          title="Redo (Cmd+Y)"
        >
          ↪ Redo <span className="editor-btn__kbd">(⌘Y)</span>
        </button>
      </div>

      {/* Navigation modes */}
      <div className="editor-toolbar__group">
        <button
          type="button"
          className={`editor-btn${mode === 'pan' ? ' editor-btn--active' : ''}`}
          onClick={() => setMode('pan')}
          disabled={isDelete}
          title="Pan (A)"
        >
          <span className="editor-btn__icon">✋</span>
          Pan <span className="editor-btn__kbd">(A)</span>
        </button>
        <button
          type="button"
          className={`editor-btn${mode === 'select' ? ' editor-btn--active' : ''}`}
          onClick={() => setMode('select')}
          disabled={isDelete}
          title="Select (S)"
        >
          <span className="editor-btn__icon">✦</span>
          Select <span className="editor-btn__kbd">(S)</span>
        </button>
      </div>

      {/* Door tool */}
      <div className="editor-toolbar__group">
        <button
          type="button"
          className={`editor-btn${mode === 'add-door' ? ' editor-btn--active' : ''}`}
          onClick={() => setMode('add-door')}
          disabled={isDelete}
          title="Add Door (D)"
        >
          <span className="editor-btn__icon">🚪</span>
          Add Door <span className="editor-btn__kbd">(D)</span>
        </button>
      </div>

      {/* Delete */}
      <div className="editor-toolbar__group">
        <button
          type="button"
          className={`editor-btn editor-btn--danger${isDelete ? ' editor-btn--active' : ''}`}
          onClick={() => setMode(isDelete ? 'select' : 'delete')}
          title="Delete (Del)"
        >
          ✕ Delete <span className="editor-btn__kbd">(Del)</span>
        </button>
      </div>
    </div>
  );
}
