import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, UserPlus, FileText, ChevronUp } from 'lucide-react';

const ROBOT_HIDDEN_PATHS = ['/jobseekers', '/login', '/register', '/profile', '/employer-dashboard', '/admin'];

const RobotAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const hideRobot = isAuthenticated || ROBOT_HIDDEN_PATHS.some(p => location.pathname.startsWith(p));

  // Close menu on route change
  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  // Scroll-to-top visibility
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleCvClick = () => {
    setIsOpen(false);
    navigate('/jobseekers');
    setTimeout(() => {
      const tryScroll = (attempts = 0) => {
        const el = document.getElementById('ai-cv-section');
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: y, behavior: 'smooth' });
        } else if (attempts < 15) {
          setTimeout(() => tryScroll(attempts + 1), 200);
        }
      };
      tryScroll();
    }, 100);
  };

  // Don't render anything if both robot and scroll-top are hidden
  if (hideRobot && !showScrollTop) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex flex-col items-end gap-2">
      {/* Popup menu — above the dock */}
      <AnimatePresence>
        {isOpen && !hideRobot && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2 }}
            className="mb-1 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-64"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-gray-800">Si mund t'ju ndihmoj?</span>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => { navigate('/jobseekers?signup=true'); setIsOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors flex-shrink-0">
                  <UserPlus size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Krijo llogari</p>
                  <p className="text-xs text-gray-500">Regjistrohu si punëkërkues</p>
                </div>
              </button>
              <button
                onClick={handleCvClick}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-green-50 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors flex-shrink-0">
                  <FileText size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Gjenero CV</p>
                  <p className="text-xs text-gray-500">Krijo CV me inteligjencë artificiale</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating dock — shared pill for both buttons */}
      <div className="flex flex-col items-center gap-0 rounded-full bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 p-1.5">
        {/* Robot button */}
        {!hideRobot && (
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            className="w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
            animate={isOpen ? {} : { y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            whileTap={{ scale: 0.93 }}
            aria-label="Asistenti virtual"
          >
            {isOpen ? <X size={22} /> : <Bot size={22} />}
          </motion.button>
        )}

        {/* Scroll-to-top button */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className={`w-12 h-12 rounded-full bg-gray-800 hover:bg-gray-900 text-white flex items-center justify-center transition-colors ${!hideRobot ? 'mt-1' : ''}`}
              whileTap={{ scale: 0.93 }}
              aria-label="Kthehu në fillim"
            >
              <ChevronUp size={22} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default RobotAssistant;
