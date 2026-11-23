import { usePhoto } from '../lib/photos';

interface Props {
  userId?: string | null;
  /** Used for the initial shown when there is no picture. */
  name?: string | null;
  size?: 'small' | 'large';
}

/** A person's or home's picture in a circle; their initial when they have none. */
export default function Avatar({ userId, name, size }: Props) {
  const photo = usePhoto(userId);
  const initial = (name ?? '').trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={`avatar ${size ?? ''} ${photo ? 'has-photo' : ''}`.trim()} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : initial}
    </span>
  );
}
