import React from 'react';
import '../WallEditor/FloorEditor.css';

export default function ObjectToolbar({
  mode, setMode,
  onDetect, detecting,
  disabled,
  selectedObject,
}) {
  const isPan    = mode === 'pan';
  const isAdd    = mode === 'add';
  const isDelete = mode === 'delete';

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__group">
        <button
          type="button"
          className={`editor-btn${isPan ? ' editor-btn--active' : ''}`}
          onClick={() => setMode?.('pan')}
          disabled={disabled}
          title="Pan / zoom (scroll to zoom)"
        >
          <span className="editor-btn__icon">✋</span>
          Pan
        </button>

        <button
          type="button"
          className={`editor-btn${isAdd ? ' editor-btn--active' : ''}`}
          onClick={() => setMode?.(isAdd ? 'pan' : 'add')}
          disabled={disabled || !selectedObject}
          title={selectedObject
            ? `Draw bounding box for "${selectedObject}"`
            : 'Select an object in the sidebar first'}
        >
          + Add
          {isAdd && selectedObject && (
            <span className="editor-toolbar__badge">{selectedObject}</span>
          )}
        </button>

        <button
          type="button"
          className={`editor-btn editor-btn--danger${isDelete ? ' editor-btn--active' : ''}`}
          onClick={() => setMode?.(isDelete ? 'pan' : 'delete')}
          disabled={disabled || !selectedObject}
          title={selectedObject
            ? 'Click a bounding box to remove it'
            : 'Select an object in the sidebar first'}
        >
          ✕ Delete
        </button>
      </div>

      <div className="editor-toolbar__group">
        <button
          type="button"
          className="editor-btn editor-btn--primary"
          onClick={onDetect}
          disabled={detecting || disabled || !selectedObject}
          title={selectedObject
            ? `Run template detection for "${selectedObject}"`
            : 'Select an object in the sidebar first'}
        >
          {detecting ? `Detecting ${selectedObject}…` : '⚡ Detect Objects'}
        </button>
      </div>
    </div>
  );
}
