import React, { useState, useEffect } from 'react';
import { Phone, Mail } from 'lucide-react';

interface ContactInfo {
  heading: string;
  subheading: string;
  phone: string;
  email: string;
  images: string[];
}

interface RotatingContactProps {
  contacts?: ContactInfo[];
  rotationInterval?: number; // in milliseconds
  className?: string;
}

const defaultContacts: ContactInfo[] = [
  {
    heading: 'Pyetje?',
    subheading: 'Ne jemi këtu për të ndihmuar!',
    phone: '+355 69 123 4567',
    email: 'support@advance.al',
    images: ['/api/placeholder/80/80', '/api/placeholder/80/80', '/api/placeholder/80/80']
  },
  {
    heading: 'Keni nevojë për ndihmë?',
    subheading: 'Ekipi ynë është gjithmonë gati!',
    phone: '+355 69 987 6543',
    email: 'info@advance.al',
    images: ['/api/placeholder/80/80', '/api/placeholder/80/80', '/api/placeholder/80/80']
  },
  {
    heading: 'Na kontaktoni',
    subheading: 'Jemi vetëm një telefonatë larg!',
    phone: '+355 69 555 7777',
    email: 'hello@advance.al',
    images: ['/api/placeholder/80/80', '/api/placeholder/80/80', '/api/placeholder/80/80']
  }
];

const RotatingContact: React.FC<RotatingContactProps> = ({
  contacts = defaultContacts,
  rotationInterval = 5000,
  className = ''
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);

      setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % contacts.length);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 300);
    }, rotationInterval);

    return () => clearInterval(interval);
  }, [contacts.length, rotationInterval, lastInteractionTime]); // Adding lastInteractionTime restarts the interval

  const currentContact = contacts[currentIndex];

  const handleDotClick = (idx: number) => {
    if (idx === currentIndex) return; // Don't do anything if already on this slide

    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(idx);
      setIsTransitioning(false);
      setLastInteractionTime(Date.now()); // This will restart the auto-rotation timer
    }, 300);
  };

  return (
    <section className={`w-full py-12 px-6 ${className}`}>
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-[#1e3a8a] to-[#1e40af] rounded-3xl p-4 md:p-8 shadow-lg overflow-hidden">
        {/* Responsive height container - auto on mobile, fixed on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-center min-h-[340px] md:h-[280px]">
          {/* Left side - 3D Asset - Bigger size */}
          <div className="flex justify-center md:justify-start items-center h-full">
            <div className={`transition-all duration-500 ${
              isTransitioning ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
            }`}>
              <img
                src="/3d_assets/chat.png"
                alt="Support - We're here to help"
                className="w-full max-w-[320px] md:max-w-[380px] object-contain"
                loading="lazy"
              />
            </div>
          </div>

          {/* Right side - Contact info - Flexible height */}
          <div
            className={`text-white transition-all duration-300 flex flex-col justify-center py-4 md:py-0 text-center md:text-left ${
              isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-2 leading-tight">
              {currentContact.heading}
            </h2>
            <p className="text-lg md:text-xl text-white/90 mb-5 leading-snug">
              {currentContact.subheading}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start items-center sm:items-start">
              {/* Phone */}
              <a
                href={`tel:${currentContact.phone}`}
                className="flex items-center gap-2.5 group"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#228be6] group-hover:bg-[#1c7ed6] transition-colors flex-shrink-0">
                  <Phone className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-medium group-hover:underline whitespace-nowrap">
                  {currentContact.phone}
                </span>
              </a>

              {/* Email */}
              <a
                href={`mailto:${currentContact.email}`}
                className="flex items-center gap-2.5 group"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#228be6] group-hover:bg-[#1c7ed6] transition-colors flex-shrink-0">
                  <Mail className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-medium group-hover:underline break-all">
                  {currentContact.email}
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Rotation indicator dots */}
        <div className="flex justify-center gap-3 mt-6 md:mt-8">
          {contacts.map((_, idx) => (
            <button
              key={idx}
              onClick={() => handleDotClick(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentIndex
                  ? 'bg-white w-8'
                  : 'bg-white/40 hover:bg-white/60 w-2'
              }`}
              aria-label={`Go to contact ${idx + 1}`}
            />
          ))}
        </div>
        </div>
      </div>
    </section>
  );
};

export default RotatingContact;
