type IconName =
  | 'play'
  | 'pause'
  | 'back5'
  | 'forward5'
  | 'star'
  | 'trash'
  | 'copy'
  | 'download'
  | 'search'
  | 'import'
  | 'sync'
  | 'phone'
  | 'arrow-left'
  | 'check'
  | 'spark'
  | 'close'
  | 'sources'
  | 'mail'
  | 'wave'
  | 'inbox'
  | 'edit';

const PATHS: Record<IconName, JSX.Element> = {
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  back5: (
    <>
      <path d="M4 9a8 8 0 1 1 1.2 8.5" />
      <path d="M4 4v5h5" />
    </>
  ),
  forward5: (
    <>
      <path d="M20 9a8 8 0 1 0-1.2 8.5" />
      <path d="M20 4v5h-5" />
    </>
  ),
  star: <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9L9.6 9 12 4Z" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 12h10l1-12" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5H6a2 2 0 0 0-2 2v9" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5L16.5 11" />
      <path d="M5 19h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  import: (
    <>
      <path d="M12 15V4" />
      <path d="m7.5 9.5 4.5-5 4.5 5" />
      <path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  sync: (
    <>
      <path d="M20 11a8 8 0 0 0-13.6-4.6L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 13.6 4.6L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </>
  ),
  phone: (
    <path d="M6.5 3.5 9 8l-2 2a12 12 0 0 0 7 7l2-2 4.5 2.5V20a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 2 5.7 2 2 0 0 1 4 3.5h2.5Z" />
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m10.5 6.5-6 5.5 6 5.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  spark: (
    <>
      <path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4" />
      <path d="m6.7 6.7 2.6 2.6M14.7 14.7l2.6 2.6M17.3 6.7l-2.6 2.6M9.3 14.7l-2.6 2.6" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sources: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  wave: (
    <>
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13h4l1.5 3h5L16 13h4" />
      <path d="M5.5 4.5h13L21 13v5.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13l2.5-8.5Z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14.5 5.5 4 4" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
