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
    <section className={`w-full py-16 px-6 ${className}`}>
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-[#2d6a6a] to-[#1f4d4d] rounded-3xl p-8 md:p-12 shadow-lg">
        {/* Fixed height container to ensure all cards have same dimensions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center min-h-[280px] md:min-h-[260px]">
          {/* Left side - Profile images */}
          <div className="flex justify-center md:justify-start gap-4">
            {currentContact.images.map((img, idx) => (
              <div
                key={idx}
                className={`w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 overflow-hidden transition-all duration-500 ${
                  isTransitioning ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
                }`}
                style={{ transitionDelay: `${idx * 100}ms` }}
              >
                <img
                  src={img}
                  alt={`Team member ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>

          {/* Right side - Contact info - Fixed height */}
          <div
            className={`text-white transition-all duration-300 flex flex-col justify-center ${
              isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-3 leading-tight">
              {currentContact.heading}
            </h2>
            <p className="text-xl md:text-2xl text-white/90 mb-8 leading-snug">
              {currentContact.subheading}
            </p>

            <div className="flex flex-col sm:flex-row gap-6">
              {/* Phone */}
              <a
                href={`tel:${currentContact.phone}`}
                className="flex items-center gap-3 group"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500 group-hover:bg-green-600 transition-colors">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-medium group-hover:underline whitespace-nowrap">
                  {currentContact.phone}
                </span>
              </a>

              {/* Email */}
              <a
                href={`mailto:${currentContact.email}`}
                className="flex items-center gap-3 group"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500 group-hover:bg-green-600 transition-colors">
                  <Mail className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-medium group-hover:underline break-all">
                  {currentContact.email}
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Rotation indicator dots */}
        <div className="flex justify-center gap-3 mt-12">
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
