import React from 'react';

const RotatingContact: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section id="contact-section" className={`w-full py-8 px-6 ${className}`}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-foreground">
          Na Kontaktoni
        </h2>

        {/* Business Card - full width, two panels */}
        <div className="flex flex-col sm:flex-row">
          {/* Left Panel - Blue with logo */}
          <div className="bg-[#3b64a8] flex flex-col items-center justify-center px-16 py-16 sm:w-[45%] rounded-lg sm:rounded-r-none">
            <div className="w-36 h-36 md:w-44 md:h-44 rounded-full border-[3px] border-white/30 overflow-hidden flex items-center justify-center bg-white mb-6">
              <img
                src="/logo.jpeg"
                alt="Advance.al logo"
                className="w-28 h-28 md:w-36 md:h-36 object-contain"
              />
            </div>
            <p className="text-white/80 text-sm md:text-base font-normal text-center tracking-wide">
              Me shpejt, me thjeshte, me mire.
            </p>
          </div>

          {/* Right Panel - White with contact details */}
          <div className="bg-white border border-gray-200 sm:border-l-0 flex flex-col items-center justify-center px-12 md:px-16 py-16 sm:w-[55%] rounded-lg sm:rounded-l-none text-center">
            <p className="text-lg md:text-xl text-foreground font-medium tracking-wide">Cel. 00355 68 661 1796</p>
            <a href="mailto:Advanc@gmail.com" className="text-lg md:text-xl text-primary hover:text-primary/80 transition-colors block font-medium tracking-wide mb-8">
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
