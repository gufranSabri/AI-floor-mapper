import React from 'react';
import '../WallEditor/FloorEditor.css';

export default function RoomToolbar({ mode, setMode }) {
  const isDelete = mode === 'delete';
  const isToggle = mode === 'toggle';
  const isAdd    = mode === 'add';

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__group">
        <button
          type="button"
          className={`editor-btn${mode === 'pan' ? ' editor-btn--active' : ''}`}
          onClick={() => setMode('pan')}
          title="Pan (A)"
        >
          <span className="editor-btn__icon">✋</span>
          Pan <span className="editor-btn__kbd">(A)</span>
        </button>
        <button
          type="button"
          className={`editor-btn${mode === 'select' ? ' editor-btn--active' : ''}`}
          onClick={() => setMode('select')}
          title="Select (S)"
        >
          <span className="editor-btn__icon">✦</span>
          Select <span className="editor-btn__kbd">(S)</span>
        </button>
        <button
          type="button"
          className={`editor-btn${isToggle ? ' editor-btn--active' : ''}`}
          onClick={() => setMode(isToggle ? 'select' : 'toggle')}
          title="Toggle active/inactive (T)"
        >
          <span className="editor-btn__icon">◑</span>
          Toggle <span className="editor-btn__kbd">(T)</span>
        </button>
      </div>

      <div className="editor-toolbar__group">
        <button
          type="button"
          className={`editor-btn${isAdd ? ' editor-btn--active' : ''}`}
          onClick={() => setMode(isAdd ? 'select' : 'add')}
          title="Add room"
        >
          + Add
        </button>
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
