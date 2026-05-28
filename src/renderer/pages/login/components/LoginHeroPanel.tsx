import React from 'react';

type LoginHeroPanelProps = {
  badge: string;
  title: string;
  description: string;
  introTitle: string;
  introText: string;
  illustrationSrc: string;
  illustrationAlt: string;
  edition: 'standalone' | 'enterprise';
};

const LoginHeroPanel: React.FC<LoginHeroPanelProps> = ({
  badge,
  title,
  description,
  introTitle,
  introText,
  illustrationSrc,
  illustrationAlt,
  edition,
}) => {
  return (
    <section className='login-page__hero' aria-label={title} data-edition={edition}>
      <div className='login-page__hero-backdrop' aria-hidden='true'>
        <span className='login-page__hero-glow login-page__hero-glow--one' />
        <span className='login-page__hero-glow login-page__hero-glow--two' />
        <span className='login-page__hero-grid' />
        <span className='login-page__hero-cube login-page__hero-cube--one' />
        <span className='login-page__hero-cube login-page__hero-cube--two' />
        <span className='login-page__hero-cube login-page__hero-cube--three' />
      </div>

      <div className={`login-page__hero-content login-page__hero-content--${edition}`}>
        <div className='login-page__hero-badge'>{badge}</div>

        <div className='login-page__hero-copy'>
          <h2 className='login-page__hero-title'>{title}</h2>
          <p className='login-page__hero-description'>{description}</p>
        </div>

        <div className='login-page__hero-visual'>
          <img src={illustrationSrc} alt={illustrationAlt} className='login-page__hero-visual-img' />
        </div>

        {edition === 'enterprise' ? (
          <div className='login-page__hero-intro'>
            <div className='login-page__hero-intro-title'>{introTitle}</div>
            <p className='login-page__hero-intro-text'>{introText}</p>
          </div>
        ) : (
          <p className='login-page__hero-footnote'>{introText}</p>
        )}
      </div>
    </section>
  );
};

export default LoginHeroPanel;
