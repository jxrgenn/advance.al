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
    <section id="contact-section" className={`w-full py-8 px-6 ${className}`}>
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-br from-[#1e3a8a] to-[#1e40af] rounded-2xl p-3 md:px-6 md:py-2 shadow-lg overflow-hidden">
        {/* Responsive grid — text side drives the height, image overflows and clips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-center">
          {/* Left side - 3D Asset - full size, overflows vertically and gets clipped by parent overflow-hidden */}
          <div className="flex justify-center md:justify-start items-center md:-my-8 md:-ml-4 md:translate-y-2">
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
            className={`text-white transition-all duration-300 flex flex-col justify-center py-3 md:py-0 text-center md:text-left ${
              isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-1.5 leading-tight">
              {currentContact.heading}
            </h2>
            <p className="text-base md:text-lg text-white/90 mb-4 leading-snug">
              {currentContact.subheading}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start items-center sm:items-start">
              {/* Phone */}
              <a
                href={`tel:${currentContact.phone}`}
                className="flex items-center gap-2 group"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#228be6] group-hover:bg-[#1c7ed6] transition-colors flex-shrink-0">
                  <Phone className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium group-hover:underline whitespace-nowrap">
                  {currentContact.phone}
                </span>
              </a>

              {/* Email */}
              <a
                href={`mailto:${currentContact.email}`}
                className="flex items-center gap-2 group"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#228be6] group-hover:bg-[#1c7ed6] transition-colors flex-shrink-0">
                  <Mail className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium group-hover:underline break-all">
                  {currentContact.email}
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Rotation indicator dots */}
        <div className="flex justify-center gap-3 mt-4 md:mt-5">
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
