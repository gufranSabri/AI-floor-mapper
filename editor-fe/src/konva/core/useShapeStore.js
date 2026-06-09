import { useReducer, useCallback } from 'react';

// ── Generic shape store ───────────────────────────────────────────────────────
// Manages an array of shapes + selection + active mode + full undo/redo history.
// Shape objects are plain data: { id, type, points, ...styleProps }
// No wall-specific logic lives here — see useConnectionStore for that.

const baseState = {
  shapes: [],
  selectedId: null,
  mode: 'select',
};

const historyInit = { past: [], present: baseState, future: [] };

function coreReducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload, selectedId: null };

    case 'ADD_SHAPE':
      return { ...state, shapes: [...state.shapes, action.payload] };

    case 'UPDATE_SHAPE':
      return {
        ...state,
        shapes: state.shapes.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.patch } : s
        ),
      };

    case 'DELETE_SHAPE': {
      const id = action.payload;
      return {
        ...state,
        shapes: state.shapes.filter(s => s.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }

    case 'SELECT':
      return { ...state, selectedId: action.payload };

    case 'DESELECT':
      return { ...state, selectedId: null };

    case 'MOVE_SHAPE': {
      const { id, dx, dy } = action.payload;
      return {
        ...state,
        shapes: state.shapes.map(s => {
          if (s.id !== id) return s;
          const pts = [...s.points];
          for (let i = 0; i < pts.length; i += 2) {
            pts[i] += dx;
            pts[i + 1] += dy;
          }
          return { ...s, points: pts };
        }),
      };
    }

    case 'LOAD_SHAPES':
      return { ...state, shapes: action.payload };

    case 'CLEAR_ALL':
      return { ...baseState };

    default:
      return state;
  }
}

const UNDOABLE = new Set([
  'ADD_SHAPE', 'DELETE_SHAPE', 'UPDATE_SHAPE',
  'MOVE_SHAPE', 'LOAD_SHAPES', 'CLEAR_ALL',
]);

function historyReducer(history, action) {
  if (action.type === 'UNDO') {
    if (!history.past.length) return history;
    const prev = history.past[history.past.length - 1];
    return {
      past: history.past.slice(0, -1),
      present: prev,
      future: [history.present, ...history.future],
    };
  }
  if (action.type === 'REDO') {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
  }

  const next = coreReducer(history.present, action);
  if (UNDOABLE.has(action.type)) {
    return { past: [...history.past, history.present], present: next, future: [] };
  }
  return { ...history, present: next };
}

export function useShapeStore(initialShapes = []) {
  const [history, dispatch] = useReducer(historyReducer, {
    ...historyInit,
    present: { ...baseState, shapes: initialShapes },
  });

  const state    = history.present;
  const canUndo  = history.past.length > 0;
  const canRedo  = history.future.length > 0;

  const undo        = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo        = useCallback(() => dispatch({ type: 'REDO' }), []);
  const setMode     = useCallback(m  => dispatch({ type: 'SET_MODE',     payload: m }),         []);
  const addShape    = useCallback(s  => dispatch({ type: 'ADD_SHAPE',    payload: s }),         []);
  const updateShape = useCallback((id, patch) => dispatch({ type: 'UPDATE_SHAPE', payload: { id, patch } }), []);
  const deleteShape = useCallback(id => dispatch({ type: 'DELETE_SHAPE', payload: id }),        []);
  const select      = useCallback(id => dispatch({ type: 'SELECT',       payload: id }),        []);
  const deselect    = useCallback(()  => dispatch({ type: 'DESELECT' }),                        []);
  const moveShape   = useCallback((id, dx, dy) => dispatch({ type: 'MOVE_SHAPE', payload: { id, dx, dy } }), []);
  const loadShapes  = useCallback(shapes => dispatch({ type: 'LOAD_SHAPES', payload: shapes }), []);
  const clearAll    = useCallback(()  => dispatch({ type: 'CLEAR_ALL' }),                       []);

  return {
    state, canUndo, canRedo,
    undo, redo, setMode,
    addShape, updateShape, deleteShape,
    select, deselect, moveShape, loadShapes, clearAll,
    // expose raw dispatch so domain extensions can fire their own actions
    dispatch,
  };
}
