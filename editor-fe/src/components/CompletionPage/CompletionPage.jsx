import './CompletionPage.css';

export default function CompletionPage({ floorName, onHome }) {
  const display = floorName
    ? floorName.replace(/_/g, ' ').replace(/-/g, ' ')
    : 'Floor';

  return (
    <div className="completion">
      <div className="completion__icon">✓</div>
      <h1 className="completion__title">Congratulations!</h1>
      <p className="completion__subtitle">
        <span className="completion__floor">{display}</span> mapping is complete.
      </p>
      <p className="completion__body">
        All walls, doors, rooms, and objects have been mapped and saved.
      </p>
      <button
        className="button button--primary completion__btn"
        type="button"
        onClick={onHome}
      >
        Return to Home
      </button>
    </div>
  );
}
