import React from 'react';

const RotatingContact: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section id="contact-section" className={`w-full py-8 px-6 ${className}`}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-foreground">
          Na Kontaktoni
        </h2>

        {/* Business Card - two separated panels */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Left Panel - Blue with logo */}
          <div className="bg-[#2e5fb2] flex flex-col items-center justify-center px-16 py-14 sm:w-[45%] shadow-md">
            <div className="w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden bg-white mb-6">
              <img
                src="/logo_V2.png"
                alt="Advance.al logo"
                className="w-full h-full object-cover"
                style={{ transform: 'scale(1.35)' }}
              />
            </div>
            <p className="text-white/80 text-sm md:text-base font-light italic text-center tracking-wide">
              Me shpejt, me thjeshte, me mire.
            </p>
          </div>

          {/* Right Panel - White with contact details */}
          <div className="bg-white border border-gray-200 flex flex-col items-center justify-center px-12 md:px-16 py-14 sm:w-[55%] shadow-md text-center">
            <p className="text-lg md:text-xl text-foreground font-medium tracking-wide">Cel. 00355 68 661 1796</p>
            <a href="mailto:Advanc@gmail.com" className="text-lg md:text-xl text-foreground hover:text-primary transition-colors block font-medium tracking-wide mb-6">
              Advanc@gmail.com
            </a>

            <p className="text-base md:text-lg text-muted-foreground tracking-wide">
              Rr. Bardhok Biba, Tiranë
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RotatingContact;
