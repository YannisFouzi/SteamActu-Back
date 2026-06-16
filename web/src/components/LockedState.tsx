import { LockIcon, CheckmarkIcon } from './Icons';

export interface LockedInstruction {
  text: string;
  completed?: boolean;
}

// Locked-library / locked-wishlist empty state. Faithful port of the mobile
// EmptyStateMessage (lock icon, title, numbered steps that turn into a green
// checkmark once completed, a primary "open Steam settings" action and a
// secondary "check my profile" action with a spinner). Shared by Mes jeux and
// Wishlist in SuivreSection — same module used by the plugin, web and extension.
export default function LockedState({
  title,
  instructions,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  secondaryLoading = false,
}: {
  title: string;
  instructions: LockedInstruction[];
  actionText: string;
  onAction: () => void;
  secondaryActionText: string;
  onSecondaryAction: () => void;
  secondaryLoading?: boolean;
}) {
  return (
    <div className="locked-state">
      <div className="locked-icon">
        <LockIcon size={56} />
      </div>
      <div className="locked-title">{title}</div>
      <ol className="locked-steps">
        {instructions.map((step, i) => (
          <li
            key={step.text}
            className={`locked-step${step.completed ? ' done' : ''}`}
          >
            <span className="locked-step-index">
              {step.completed ? <CheckmarkIcon size={14} /> : i + 1}
            </span>
            <span className="locked-step-text">{step.text}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="locked-primary" onClick={onAction}>
        {actionText}
      </button>
      <button
        type="button"
        className="locked-secondary"
        onClick={onSecondaryAction}
        disabled={secondaryLoading}
      >
        {secondaryLoading ? (
          <span className="locked-spinner" aria-hidden="true" />
        ) : (
          secondaryActionText
        )}
      </button>
    </div>
  );
}
