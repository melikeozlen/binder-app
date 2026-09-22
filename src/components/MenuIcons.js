/** Menü için standart stroke ikonlar (currentColor). */
export function MenuIcon({ name, size = 14, className = 'menu-icon' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

const ICONS = {
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),
  'save-as': (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="9.5" y1="13.5" x2="14.5" y2="13.5" />
    </>
  ),
  cloud: (
    <>
      <path d="M17.5 19H9a5 5 0 1 1 1.5-9.8A5.5 5.5 0 1 1 17.5 19z" />
    </>
  ),
  'cloud-upload': (
    <>
      <path d="M17.5 19H9a5 5 0 1 1 1.5-9.8A5.5 5.5 0 1 1 17.5 19z" />
      <polyline points="12 15 12 9" />
      <polyline points="9.5 11.5 12 9 14.5 11.5" />
    </>
  ),
  'cloud-check': (
    <>
      <path d="M17.5 19H9a5 5 0 1 1 1.5-9.8A5.5 5.5 0 1 1 17.5 19z" />
      <polyline points="9.5 14 11.5 16 15 12" />
    </>
  ),
  leave: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  spinner: (
    <>
      <path d="M12 2v4" />
      <path d="M12 18v4" opacity="0.35" />
      <path d="M4.93 4.93l2.83 2.83" opacity="0.7" />
      <path d="M16.24 16.24l2.83 2.83" opacity="0.25" />
      <path d="M2 12h4" opacity="0.55" />
      <path d="M18 12h4" opacity="0.15" />
      <path d="M4.93 19.07l2.83-2.83" opacity="0.4" />
      <path d="M16.24 7.76l2.83-2.83" opacity="0.85" />
    </>
  ),
};
