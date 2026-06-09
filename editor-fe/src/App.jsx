import { useEffect, useState } from 'react';
import './App.css';

import Home from './components/Home/Home';
import MapStage from './components/MapStage/MapStage';
import FloorEditor from './components/WallEditor/WallEditor';
import DoorEditor from './components/DoorEditor/DoorEditor';
import RoomEditor from './components/RoomEditor/RoomEditor';
import ObjectEditor from './components/ObjectEditor/ObjectEditor';
import CompletionPage from './components/CompletionPage/CompletionPage';

const STEPS = [
  { key: 'map',     label: 'World Positioning' },
  { key: 'editor',  label: 'Wall Mapping' },
  { key: 'doors',   label: 'Door Mapping' },
  { key: 'rooms',   label: 'Room Mapping' },
  { key: 'objects', label: 'Object Mapping' },
];

// Which step index (0-based) is the last — driven by VITE_LAST_STEP (1-based).
const LAST_STEP_IDX = Math.min(
  Math.max((parseInt(import.meta.env.VITE_LAST_STEP, 10) || 5) - 1, 0),
  STEPS.length - 1,
);

function StageRoadmap({ stage, onStepClick }) {
  const activeIdx = STEPS.findIndex(s => s.key === stage);
  const visibleSteps = STEPS.slice(0, LAST_STEP_IDX + 1);

  return (
    <div className="roadmap">
      {visibleSteps.map((step, i) => {
        const done      = i < activeIdx;
        const active    = i === activeIdx;
        const inactive  = activeIdx === -1 || i > activeIdx;
        const clickable = done;
        return (
          <div
            key={step.key}
            className={`roadmap__step${clickable ? ' roadmap__step--clickable' : ''}`}
            onClick={() => clickable && onStepClick?.(step.key)}
            title={clickable ? `Go to ${step.label}` : undefined}
          >
            {i > 0 && (
              <div className={`roadmap__connector${done || active ? ' roadmap__connector--done' : ''}`} />
            )}
            <div className={`roadmap__circle${done ? ' roadmap__circle--done' : active ? ' roadmap__circle--active' : ' roadmap__circle--inactive'}`}>
              {done ? '✓' : i + 1}
            </div>
            <span className={`roadmap__label${active ? ' roadmap__label--active' : inactive && activeIdx !== -1 ? ' roadmap__label--inactive' : ''}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SiteHeader({ onHome }) {
  return (
    <header className="site-header">
      <button className="site-header__logo" type="button" onClick={onHome} aria-label="Go to home">
        <div className="site-header__mark" />
        <span className="site-header__wordmark">RasmView</span>
      </button>
    </header>
  );
}

export default function App() {
  const [stage, setStage] = useState('upload');
  const [floorplan, setFloorplan] = useState(null);
  const [floorData, setFloorData] = useState(null);

  useEffect(() => {
    if (!floorplan?.url) return undefined;
    const image = new Image();
    image.onload = () => {
      setFloorplan((current) => {
        if (!current || current.url !== floorplan.url) return current;
        return {
          ...current,
          aspectRatio: image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1,
        };
      });
    };
    image.src = floorplan.url;
    return undefined;
  }, [floorplan?.url]);

  function goHome() {
    setStage('upload');
    setFloorplan(null);
    setFloorData(null);
  }

  // Determine whether a given step index is the configured last step.
  function isLastStep(stepKey) {
    return STEPS.findIndex(s => s.key === stepKey) === LAST_STEP_IDX;
  }

  function handleNext(data) {
    setFloorData(data);
    if (isLastStep('map')) { setStage('done'); return; }
    setStage('editor');
  }

  function handleEditorNext(updatedData, opts = {}) {
    setFloorData(updatedData);
    if (opts.resetOnly) return;
    if (isLastStep('editor')) { setStage('done'); return; }
    setStage('doors');
  }

  function handleDoorNext(updatedData) {
    setFloorData(updatedData);
    if (isLastStep('doors')) { setStage('done'); return; }
    setStage('rooms');
  }

  function handleRoomNext(updatedData) {
    if (updatedData) setFloorData(updatedData);
    if (isLastStep('rooms')) { setStage('done'); return; }
    setStage('objects');
  }

  const showRoadmap = stage !== 'upload' && stage !== 'done';
  const showHeader  = stage !== 'done';

  const STEP_KEYS = STEPS.map(s => s.key);
  function handleStepNav(key) {
    const current = STEP_KEYS.indexOf(stage);
    const target  = STEP_KEYS.indexOf(key);
    if (target < current) setStage(key);
  }

  return (
    <>
      {/* Too-short guard — rendered outside app-shell so it always overlays */}
      <div className="too-short" aria-hidden="true">
        <div className="too-short__icon">↕</div>
        <div className="too-short__title">Window too short</div>
        <div className="too-short__sub">Please resize your browser window taller to use RasmView.</div>
      </div>

      <main className="app-shell">

        {showHeader && <SiteHeader onHome={goHome} />}

        <div className="app-body">
          <div className="content-card">
            {showRoadmap && (
              <div className="roadmap-bar">
                <StageRoadmap stage={stage} onStepClick={handleStepNav} />
              </div>
            )}

            {stage === 'upload' && (
              <Home setFloorplan={setFloorplan} setFloorData={setFloorData} setStage={setStage} />
            )}
            {stage === 'map' && (
              <MapStage
                floorplan={floorplan}
                floorData={floorData}
                onBack={() => setStage('upload')}
                onNext={handleNext}
                isLastStep={isLastStep('map')}
              />
            )}
            {stage === 'editor' && (
              <FloorEditor
                floorplan={floorplan}
                floorData={floorData}
                floorName={floorplan?.stored_name?.replace(/\.[^.]+$/, '') ?? null}
                onBack={() => setStage('map')}
                onNext={handleEditorNext}
                onSave={setFloorData}
                isLastStep={isLastStep('editor')}
              />
            )}
            {stage === 'doors' && (
              <DoorEditor
                floorplan={floorplan}
                floorData={floorData}
                floorName={floorplan?.stored_name?.replace(/\.[^.]+$/, '') ?? null}
                onBack={() => setStage('editor')}
                onNext={handleDoorNext}
                isLastStep={isLastStep('doors')}
              />
            )}
            {stage === 'rooms' && (
              <RoomEditor
                floorplan={floorplan}
                floorData={floorData}
                floorName={floorplan?.stored_name?.replace(/\.[^.]+$/, '') ?? null}
                onBack={() => setStage('doors')}
                onNext={handleRoomNext}
                isLastStep={isLastStep('rooms')}
              />
            )}
            {stage === 'objects' && (
              <ObjectEditor
                floorplan={floorplan}
                floorData={floorData}
                floorName={floorplan?.stored_name?.replace(/\.[^.]+$/, '') ?? null}
                onBack={() => setStage('rooms')}
                onFinish={() => setStage('done')}
                isLastStep={isLastStep('objects')}
              />
            )}
            {stage === 'done' && (
              <CompletionPage
                floorName={floorplan?.stored_name?.replace(/\.[^.]+$/, '') ?? null}
                onHome={goHome}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
