interface EulabFooterProps {
  position?: 'bottom-right' | 'top-right';
}

export const EulabFooter = ({ position = 'bottom-right' }: EulabFooterProps) => {
  const positionClasses = position === 'top-right' 
    ? 'top-4 right-4' 
    : 'bottom-4 right-4';
    
  return (
    <a 
      href="https://eulab.cloud" 
      target="_blank" 
      rel="noopener noreferrer"
      className={`fixed ${positionClasses} flex items-center gap-2 px-3 py-2 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors z-50`}
    >
      <img src="/eulab-logo.png" alt="Eulab" className="h-6 w-auto invert" />
    </a>
  );
};
