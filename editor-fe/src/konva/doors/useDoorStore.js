import { useReducer, useCallback } from 'react';

const initHistory = { past: [], present: { doors: [], mode: 'select' }, future: [] };

function reducer(history, action) {
  if (action.type === 'UNDO') {
    if (!history.past.length) return history;
    return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
  }
  if (action.type === 'REDO') {
    if (!history.future.length) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
  }

  const present = history.present;
  let next = present;

  switch (action.type) {
    case 'SET_MODE':
      next = { ...present, mode: action.payload };
      return { ...history, present: next };

    case 'ADD_DOOR':
      next = { ...present, doors: [...present.doors, action.payload] };
      return { past: [...history.past, present], present: next, future: [] };

    case 'DELETE_DOOR':
      next = { ...present, doors: present.doors.filter(d => d.id !== action.payload) };
      return { past: [...history.past, present], present: next, future: [] };

    case 'LOAD_DOORS':
      next = { ...present, doors: action.payload };
      return { past: [...history.past, present], present: next, future: [] };

    case 'CLEAR_DOORS':
      next = { ...present, doors: [] };
      return { past: [...history.past, present], present: next, future: [] };

    default:
      return history;
  }
}

export function useDoorStore() {
  const [history, dispatch] = useReducer(reducer, initHistory);

  const present = history.present;
  const state   = { doors: present.doors, mode: present.mode };
  const canUndo  = history.past.length > 0;
  const canRedo  = history.future.length > 0;

  const undo       = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo       = useCallback(() => dispatch({ type: 'REDO' }), []);
  const setMode    = useCallback(m  => dispatch({ type: 'SET_MODE',    payload: m }), []);
  const addDoor    = useCallback(d  => dispatch({ type: 'ADD_DOOR',    payload: d }), []);
  const deleteDoor = useCallback(id => dispatch({ type: 'DELETE_DOOR', payload: id }), []);
  const loadDoors  = useCallback(ds => dispatch({ type: 'LOAD_DOORS',  payload: ds }), []);
  const clearDoors = useCallback(()  => dispatch({ type: 'CLEAR_DOORS' }), []);

  return { state, canUndo, canRedo, undo, redo, setMode, addDoor, deleteDoor, loadDoors, clearDoors };
}
