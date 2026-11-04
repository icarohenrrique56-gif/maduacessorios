import { useEffect, useState } from 'react';

type SplashScreenProps = {
  isReady: boolean;
  storeReady: boolean;
  authReady: boolean;
};

export function SplashScreen({ isReady }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  useEffect(() => {
    if (!isReady || leaving) return;
    setLeaving(true);
    const timeout = window.setTimeout(() => setVisible(false), 520);
    return () => window.clearTimeout(timeout);
  }, [isReady, leaving]);

  if (!visible) return null;

  const status = 'Preparando sua experiência...';

  return (
    <div
      className={`madu-splash ${leaving ? 'madu-splash--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={status}
    >
      <div className="madu-splash__satin madu-splash__satin--left" aria-hidden="true" />
      <div className="madu-splash__satin madu-splash__satin--right" aria-hidden="true" />
      <div className="madu-splash__glow madu-splash__glow--one" aria-hidden="true" />
      <div className="madu-splash__glow madu-splash__glow--two" aria-hidden="true" />
      <main className="madu-splash__content">
        <img
          src="/assets/brand/madu-logo-transparent.png"
          alt="Madu Acessórios"
          width="1364"
          height="768"
          decoding="sync"
          draggable="false"
          className="madu-splash__logo"
        />
        <p>Detalhes que fazem você brilhar.</p>
        <div className="madu-splash__progress" role="progressbar" aria-label={status}>
          <span aria-hidden="true" />
        </div>
        <span className="madu-splash__status">{status}</span>
      </main>
    </div>
  );
}
