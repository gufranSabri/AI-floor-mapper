import { useReducer, useCallback } from 'react';
import { useShapeStore } from './useShapeStore';

// ── Wall-domain extension on top of useShapeStore ────────────────────────────
// Adds: connections, connectBuffer, mergeBuffer, moveEndpoint, splitLine,
// mergeLine, disconnectLine, disconnectEndpoint.
// The undo history covers BOTH shape mutations and connection mutations because
// all actions funnel through one combined reducer.

function makeLine(x1, y1, x2, y2, base = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'line',
    points: [x1, y1, x2, y2],
    stroke: base.stroke ?? '#1c6b5e',
    strokeWidth: base.strokeWidth ?? 2.5,
  };
}

// ── Connection-layer state ────────────────────────────────────────────────────

const connInit = {
  connections: [],
  connectBuffer: null,
  mergeBuffer: null,
};

const CONN_UNDOABLE = new Set([
  'ADD_CONNECTION', 'DISCONNECT_LINE', 'DISCONNECT_ENDPOINT',
  'MOVE_ENDPOINT', 'SPLIT_LINE', 'MERGE_WALLS',
  'LOAD_CONNECTIONS', 'CLEAR_CONNECTIONS',
]);

function connReducer(connState, shapeState, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...connState, connectBuffer: null, mergeBuffer: null };

    case 'DELETE_SHAPE': {
      const id = action.payload;
      return {
        ...connState,
        connections: connState.connections.filter(c => c.lineId !== id && c.lineId2 !== id),
      };
    }

    case 'CLEAR_ALL':
    case 'CLEAR_CONNECTIONS':
      return { ...connInit };

    case 'SET_CONNECT_BUFFER':
      return { ...connState, connectBuffer: action.payload };

    case 'SET_MERGE_BUFFER':
      return { ...connState, mergeBuffer: action.payload };

    case 'ADD_CONNECTION': {
      const { lineId, endIdx, lineId2, endIdx2 } = action.payload;
      const dup = connState.connections.some(c =>
        (c.lineId === lineId && c.endIdx === endIdx && c.lineId2 === lineId2 && c.endIdx2 === endIdx2) ||
        (c.lineId === lineId2 && c.endIdx === endIdx2 && c.lineId2 === lineId && c.endIdx2 === endIdx)
      );
      if (dup) return { ...connState, connectBuffer: null };
      return {
        ...connState,
        connections: [...connState.connections, { id: crypto.randomUUID(), lineId, endIdx, lineId2, endIdx2 }],
        connectBuffer: null,
      };
    }

    case 'DISCONNECT_LINE':
      return {
        ...connState,
        connections: connState.connections.filter(c => c.lineId !== action.payload && c.lineId2 !== action.payload),
      };

    case 'DISCONNECT_ENDPOINT': {
      const { lineId, endIdx } = action.payload;
      return {
        ...connState,
        connections: connState.connections.filter(c =>
          !((c.lineId === lineId && c.endIdx === endIdx) ||
            (c.lineId2 === lineId && c.endIdx2 === endIdx))
        ),
      };
    }

    case 'LOAD_CONNECTIONS':
      return { ...connState, connections: action.payload };

    default:
      return connState;
  }
}

// ── Combined reducer wrapping shape + connection + history ────────────────────

const SHAPE_UNDOABLE = new Set([
  'ADD_SHAPE', 'DELETE_SHAPE', 'UPDATE_SHAPE', 'MOVE_SHAPE', 'LOAD_SHAPES', 'CLEAR_ALL',
]);

function combinedReducer(history, action) {
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

  // Inline shape core reducer (mirrors useShapeStore's coreReducer)
  function nextShape(state, action) {
    switch (action.type) {
      case 'SET_MODE':       return { ...state, mode: action.payload, selectedId: null };
      case 'ADD_SHAPE':      return { ...state, shapes: [...state.shapes, action.payload] };
      case 'UPDATE_SHAPE':   return { ...state, shapes: state.shapes.map(s => s.id === action.payload.id ? { ...s, ...action.payload.patch } : s) };
      case 'DELETE_SHAPE':   return { ...state, shapes: state.shapes.filter(s => s.id !== action.payload), selectedId: state.selectedId === action.payload ? null : state.selectedId };
      case 'SELECT':         return { ...state, selectedId: action.payload };
      case 'DESELECT':       return { ...state, selectedId: null };
      case 'MOVE_SHAPE': {
        const { id, dx, dy } = action.payload;
        return { ...state, shapes: state.shapes.map(s => { if (s.id !== id) return s; const pts = [...s.points]; for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; } return { ...s, points: pts }; }) };
      }
      case 'LOAD_SHAPES':    return { ...state, shapes: action.payload };
      case 'CLEAR_ALL':      return { shapes: [], selectedId: null, mode: 'select' };
      default:               return state;
    }
  }

  // Wall-specific shape mutations (shapes AND connections change together)
  function applyWallMutation(present, action) {
    const { shapes, conn } = present;

    if (action.type === 'MOVE_ENDPOINT' || action.type === 'MOVE_ENDPOINT_LIVE') {
      const { lineId, endIdx, x, y } = action.payload;
      const visited = new Set([`${lineId}:${endIdx}`]);
      const queue = [{ lineId, endIdx }];
      while (queue.length) {
        const { lineId: curId, endIdx: curIdx } = queue.shift();
        for (const c of conn.connections) {
          let peerId = null, peerIdx = null;
          if (c.lineId === curId && c.endIdx === curIdx)       { peerId = c.lineId2; peerIdx = c.endIdx2; }
          else if (c.lineId2 === curId && c.endIdx2 === curIdx) { peerId = c.lineId;  peerIdx = c.endIdx;  }
          if (peerId !== null) {
            const key = `${peerId}:${peerIdx}`;
            if (!visited.has(key)) { visited.add(key); queue.push({ lineId: peerId, endIdx: peerIdx }); }
          }
        }
      }
      const newShapes = shapes.map(s => {
        const pts = [...s.points];
        let changed = false;
        for (const ei of [0, 1]) {
          if (visited.has(`${s.id}:${ei}`)) { pts[ei * 2] = x; pts[ei * 2 + 1] = y; changed = true; }
        }
        return changed ? { ...s, points: pts } : s;
      });
      return { shapes: newShapes, conn };
    }

    if (action.type === 'MOVE_LINE') {
      const { lineId, dx, dy } = action.payload;
      const conns = conn.connections.filter(c => c.lineId === lineId || c.lineId2 === lineId);
      const moved = new Set([lineId]);
      let newShapes = shapes.map(s => {
        if (s.id !== lineId) return s;
        const [x1, y1, x2, y2] = s.points;
        return { ...s, points: [x1 + dx, y1 + dy, x2 + dx, y2 + dy] };
      });
      for (const c of conns) {
        const otherId  = c.lineId === lineId ? c.lineId2 : c.lineId;
        const otherIdx = c.lineId === lineId ? c.endIdx2 : c.endIdx;
        const selfIdx  = c.lineId === lineId ? c.endIdx  : c.endIdx2;
        if (moved.has(otherId)) continue;
        moved.add(otherId);
        const anchor = newShapes.find(x => x.id === lineId).points;
        newShapes = newShapes.map(s => {
          if (s.id !== otherId) return s;
          const pts = [...s.points];
          pts[otherIdx * 2]     = anchor[selfIdx * 2];
          pts[otherIdx * 2 + 1] = anchor[selfIdx * 2 + 1];
          return { ...s, points: pts };
        });
      }
      return { shapes: newShapes, conn };
    }

    if (action.type === 'SPLIT_LINE') {
      const { lineId, x, y } = action.payload;
      const original = shapes.find(s => s.id === lineId);
      if (!original) return present;
      const [x1, y1, x2, y2] = original.points;
      const lineA = makeLine(x1, y1, x, y, original);
      const lineB = makeLine(x, y, x2, y2, original);
      const remapped = conn.connections
        .filter(c => c.lineId !== lineId && c.lineId2 !== lineId)
        .concat(conn.connections.filter(c => c.lineId === lineId || c.lineId2 === lineId).flatMap(c => {
          if (c.lineId === lineId) {
            const newId  = c.endIdx === 0 ? lineA.id : lineB.id;
            const newIdx = c.endIdx === 0 ? 0 : 1;
            return [{ ...c, id: crypto.randomUUID(), lineId: newId, endIdx: newIdx }];
          } else {
            const newId  = c.endIdx2 === 0 ? lineA.id : lineB.id;
            const newIdx = c.endIdx2 === 0 ? 0 : 1;
            return [{ ...c, id: crypto.randomUUID(), lineId2: newId, endIdx2: newIdx }];
          }
        }));
      const splitConn = { id: crypto.randomUUID(), lineId: lineA.id, endIdx: 1, lineId2: lineB.id, endIdx2: 0 };
      return {
        shapes: shapes.filter(s => s.id !== lineId).concat(lineA, lineB),
        conn: { ...conn, connections: [...remapped, splitConn] },
      };
    }

    if (action.type === 'MERGE_WALLS') {
      const { keepId, removeId } = action.payload;
      const kept    = shapes.find(s => s.id === keepId);
      const removed = shapes.find(s => s.id === removeId);
      if (!kept || !removed) return { shapes, conn: { ...conn, mergeBuffer: null } };

      function closestEndIdx(shape, px, py) {
        const d0 = Math.hypot(shape.points[0] - px, shape.points[1] - py);
        const d2 = Math.hypot(shape.points[2] - px, shape.points[3] - py);
        return d0 <= d2 ? 0 : 1;
      }

      const snapTargets = [];
      const remapped = conn.connections
        .filter(c => c.lineId !== removeId && c.lineId2 !== removeId)
        .concat(conn.connections.filter(c => c.lineId === removeId || c.lineId2 === removeId).map(c => {
          if (c.lineId === removeId) {
            const px = removed.points[c.endIdx * 2], py = removed.points[c.endIdx * 2 + 1];
            const ni = closestEndIdx(kept, px, py);
            snapTargets.push({ lineId: c.lineId2, endIdx: c.endIdx2, x: kept.points[ni * 2], y: kept.points[ni * 2 + 1] });
            return { ...c, id: crypto.randomUUID(), lineId: keepId, endIdx: ni };
          } else {
            const px = removed.points[c.endIdx2 * 2], py = removed.points[c.endIdx2 * 2 + 1];
            const ni = closestEndIdx(kept, px, py);
            snapTargets.push({ lineId: c.lineId, endIdx: c.endIdx, x: kept.points[ni * 2], y: kept.points[ni * 2 + 1] });
            return { ...c, id: crypto.randomUUID(), lineId2: keepId, endIdx2: ni };
          }
        }));

      const seen = new Set();
      const deduped = remapped.filter(c => {
        if (c.lineId === c.lineId2) return false;
        const key = c.lineId < c.lineId2
          ? `${c.lineId}:${c.endIdx}:${c.lineId2}:${c.endIdx2}`
          : `${c.lineId2}:${c.endIdx2}:${c.lineId}:${c.endIdx}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });

      let newShapes = shapes.filter(s => s.id !== removeId);
      for (const { lineId, endIdx, x, y } of snapTargets) {
        newShapes = newShapes.map(s => {
          if (s.id !== lineId) return s;
          const pts = [...s.points]; pts[endIdx * 2] = x; pts[endIdx * 2 + 1] = y;
          return { ...s, points: pts };
        });
      }

      return { shapes: newShapes, conn: { ...conn, connections: deduped, mergeBuffer: null } };
    }

    return present;
  }

  const WALL_MUTATIONS      = new Set(['MOVE_ENDPOINT', 'MOVE_LINE', 'SPLIT_LINE', 'MERGE_WALLS']);
  const WALL_MUTATIONS_LIVE = new Set(['MOVE_ENDPOINT_LIVE']);

  const present = history.present;

  if (WALL_MUTATIONS_LIVE.has(action.type)) {
    const result = applyWallMutation(present, action);
    const next = { shapes: result.shapes, conn: result.conn ?? present.conn, mode: present.mode, selectedId: present.selectedId };
    return { ...history, present: next };
  }

  if (WALL_MUTATIONS.has(action.type)) {
    const result = applyWallMutation(present, action);
    const next = { shapes: result.shapes, conn: result.conn ?? present.conn, mode: present.mode, selectedId: present.selectedId };
    return { past: [...history.past, present], present: next, future: [] };
  }

  // Shape-level action — update shapes slice
  const nextShapes = nextShape({ shapes: present.shapes, mode: present.mode, selectedId: present.selectedId }, action);
  // Connection-layer action — update conn slice
  const nextConn = connReducer(present.conn, present, action);

  const next = { ...present, shapes: nextShapes.shapes, mode: nextShapes.mode, selectedId: nextShapes.selectedId, conn: nextConn };

  const undoable = SHAPE_UNDOABLE.has(action.type) || CONN_UNDOABLE.has(action.type);
  if (undoable) {
    return { past: [...history.past, present], present: next, future: [] };
  }
  return { ...history, present: next };
}

// ── Public hook ───────────────────────────────────────────────────────────────

export function useConnectionStore(initialShapes = []) {
  const initPresent = {
    shapes: initialShapes,
    selectedId: null,
    mode: 'select',
    conn: { ...connInit },
  };

  const [history, dispatch] = useReducer(combinedReducer, { past: [], present: initPresent, future: [] });

  const present  = history.present;
  const state    = { shapes: present.shapes, selectedId: present.selectedId, mode: present.mode, ...present.conn };
  const canUndo  = history.past.length > 0;
  const canRedo  = history.future.length > 0;

  const undo              = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo              = useCallback(() => dispatch({ type: 'REDO' }), []);
  const setMode           = useCallback(m  => dispatch({ type: 'SET_MODE',           payload: m }),              []);
  const addShape          = useCallback(s  => dispatch({ type: 'ADD_SHAPE',          payload: s }),              []);
  const updateShape       = useCallback((id, patch) => dispatch({ type: 'UPDATE_SHAPE', payload: { id, patch } }), []);
  const deleteShape       = useCallback(id => dispatch({ type: 'DELETE_SHAPE',       payload: id }),             []);
  const select            = useCallback(id => dispatch({ type: 'SELECT',             payload: id }),             []);
  const deselect          = useCallback(()  => dispatch({ type: 'DESELECT' }),                                   []);
  const clearAll          = useCallback(()  => dispatch({ type: 'CLEAR_ALL' }),                                  []);
  const setConnectBuffer  = useCallback(b  => dispatch({ type: 'SET_CONNECT_BUFFER', payload: b }),              []);
  const setMergeBuffer    = useCallback(b  => dispatch({ type: 'SET_MERGE_BUFFER',   payload: b }),              []);
  const addConnection     = useCallback(c  => dispatch({ type: 'ADD_CONNECTION',     payload: c }),              []);
  const disconnectLine    = useCallback(id => dispatch({ type: 'DISCONNECT_LINE',    payload: id }),             []);
  const disconnectEndpoint = useCallback((lineId, endIdx) => dispatch({ type: 'DISCONNECT_ENDPOINT', payload: { lineId, endIdx } }), []);
  const moveEndpoint      = useCallback((lineId, endIdx, x, y) => dispatch({ type: 'MOVE_ENDPOINT',      payload: { lineId, endIdx, x, y } }), []);
  const moveEndpointLive  = useCallback((lineId, endIdx, x, y) => dispatch({ type: 'MOVE_ENDPOINT_LIVE', payload: { lineId, endIdx, x, y } }), []);
  const moveLine          = useCallback((lineId, dx, dy) => dispatch({ type: 'MOVE_LINE',    payload: { lineId, dx, dy } }), []);
  const splitLine         = useCallback((lineId, x, y)   => dispatch({ type: 'SPLIT_LINE',   payload: { lineId, x, y } }),  []);
  const mergeWalls        = useCallback((keepId, removeId) => dispatch({ type: 'MERGE_WALLS', payload: { keepId, removeId } }), []);

  const loadShapes = useCallback((shapes, connections = []) => {
    dispatch({ type: 'LOAD_SHAPES',      payload: shapes });
    dispatch({ type: 'LOAD_CONNECTIONS', payload: connections });
  }, []);

  return {
    state, canUndo, canRedo,
    undo, redo, setMode,
    addShape, updateShape, deleteShape,
    select, deselect, clearAll,
    setConnectBuffer, setMergeBuffer,
    addConnection, disconnectLine, disconnectEndpoint,
    moveEndpoint, moveEndpointLive, moveLine, splitLine, mergeWalls,
    loadShapes,
  };
}
