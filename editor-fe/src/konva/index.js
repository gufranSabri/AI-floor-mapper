// ── Generic primitives ────────────────────────────────────────────────────────
export { containFit }                    from './utils';
export { useShapeStore }                 from './core/useShapeStore';
export { useContainerSize }              from './stage/useContainerSize';
export { default as KonvaStage }         from './stage/KonvaStage';

// ── Wall domain ───────────────────────────────────────────────────────────────
export { useConnectionStore }            from './core/useConnectionStore';
export { default as WallLayer }          from './layers/WallLayer';
export { default as WallCanvas }         from './walls/WallCanvas';
export { makeLine }                      from './walls/wallUtils';
export { wallsToShapes, shapesToWalls }  from './walls/wallSerializers';
