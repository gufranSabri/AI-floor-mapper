import { useReducer, useCallback } from 'react';

const initHistory = {
  past: [],
  present: { rooms: [], mode: 'select' },
  future: [],
};

function reducer(history, action) {
  if (action.type === 'UNDO') {
    if (!history.past.length) return history;
    return {
      past: history.past.slice(0, -1),
      present: history.past[history.past.length - 1],
      future: [history.present, ...history.future],
    };
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

    case 'LOAD_ROOMS':
      next = { ...present, rooms: action.payload };
      return { past: [...history.past, present], present: next, future: [] };

    case 'ADD_ROOM':
      next = { ...present, rooms: [...present.rooms, action.payload] };
      return { past: [...history.past, present], present: next, future: [] };

    case 'RENAME_ROOM':
      next = {
        ...present,
        rooms: present.rooms.map(r =>
          r.id === action.payload.id ? { ...r, name: action.payload.name } : r
        ),
      };
      return { past: [...history.past, present], present: next, future: [] };

    case 'DELETE_ROOM': {
      // Only non-wall rooms (wall_ids === null) may be deleted.
      const target = present.rooms.find(r => r.id === action.payload);
      if (!target || target.wall_ids !== null) return history;
      next = { ...present, rooms: present.rooms.filter(r => r.id !== action.payload) };
      return { past: [...history.past, present], present: next, future: [] };
    }

    case 'TOGGLE_STATUS':
      next = {
        ...present,
        rooms: present.rooms.map(r =>
          r.id === action.payload
            ? { ...r, status: r.status === 'active' ? 'inactive' : 'active' }
            : r
        ),
      };
      return { past: [...history.past, present], present: next, future: [] };

    default:
      return history;
  }
}

export function useRoomStore() {
  const [history, dispatch] = useReducer(reducer, initHistory);

  const present = history.present;
  const state   = { rooms: present.rooms, mode: present.mode };
  const canUndo  = history.past.length > 0;
  const canRedo  = history.future.length > 0;

  const undo         = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo         = useCallback(() => dispatch({ type: 'REDO' }), []);
  const setMode      = useCallback(m  => dispatch({ type: 'SET_MODE',      payload: m }), []);
  const loadRooms    = useCallback(rs => dispatch({ type: 'LOAD_ROOMS',    payload: rs }), []);
  const addRoom      = useCallback(r  => dispatch({ type: 'ADD_ROOM',      payload: r }), []);
  const renameRoom   = useCallback((id, name) => dispatch({ type: 'RENAME_ROOM',   payload: { id, name } }), []);
  const deleteRoom   = useCallback(id => dispatch({ type: 'DELETE_ROOM',   payload: id }), []);
  const toggleStatus = useCallback(id => dispatch({ type: 'TOGGLE_STATUS', payload: id }), []);

  return { state, canUndo, canRedo, undo, redo, setMode, loadRooms, addRoom, renameRoom, deleteRoom, toggleStatus };
}
