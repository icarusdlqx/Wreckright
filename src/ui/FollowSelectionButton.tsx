import type { Engine } from './engine';
import { toggleFollowSelection, useFollowSelection } from './cameraNavigation';

/** Keeps the camera on the selection until the player pans away. */
export function FollowSelectionButton({
  engine,
  className,
}: {
  engine: Engine | null;
  className: string;
}) {
  const following = useFollowSelection();
  return (
    <button
      type="button"
      className={`${className}${following ? ' active' : ''}`}
      disabled={engine === null}
      aria-pressed={following}
      onClick={() => toggleFollowSelection()}
      aria-label="Follow the selection with the camera"
      title="Follow the selection until you pan (L)"
      data-testid="follow-selection"
    >
      Follow
    </button>
  );
}
