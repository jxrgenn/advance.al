import { Link, useNavigate } from "react-router-dom";
import { Building, Users, Mail, Phone, MapPin, Facebook, Linkedin, Instagram } from "lucide-react";

const Footer = () => {
  const navigate = useNavigate();

  const handleNavigation = (path: string) => {
    navigate(path);
    window.scrollTo(0, 0);
  };

  const handleAnchorNavigation = (path: string, anchor: string) => {
    navigate(path);
    setTimeout(() => {
      const element = document.getElementById(anchor);
      if (element) {
        const yOffset = -100; // Offset to show it at top with some spacing
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div>
            <h3 className="font-semibold text-lg mb-4">advance.al</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Platforma më moderne e punës në Shqipëri. Lidhim punëkërkuesit me punëdhënësit më të mirë.
            </p>
            <div className="flex gap-3">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* For Job Seekers */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Për Punëkërkuesit</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => handleNavigation('/jobs')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Shfleto Punët
                </button>
              </li>
              <li>
                <button onClick={() => handleNavigation('/jobseekers')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Regjistrohu
                </button>
              </li>
              <li>
                <button onClick={() => handleAnchorNavigation('/jobseekers', 'ai-cv-section')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Gjenero CV me AI
                </button>
              </li>
              <li>
                <button onClick={() => handleNavigation('/companies')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Shfleto Kompanitë
                </button>
              </li>
            </ul>
          </div>

          {/* For Employers & Companies */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Për Punëdhënësit</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => handleNavigation('/employers')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Regjistrohu si Punëdhënës
                </button>
              </li>
              <li>
                <button onClick={() => handleNavigation('/employer-register')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Regjistrohu si Kompani
                </button>
              </li>
              <li>
                <button onClick={() => handleNavigation('/companies')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Profili i Kompanisë
                </button>
              </li>
            </ul>
          </div>

          {/* Support & Legal */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Mbështetje</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => handleNavigation('/about')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Rreth Nesh
                </button>
              </li>
              <li>
                <a href="mailto:info@advance.al" className="text-muted-foreground hover:text-primary transition-colors">
                  Kontakti
                </a>
              </li>
              <li>
                <button onClick={() => handleNavigation('/privacy')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Politika e Privatësisë
                </button>
              </li>
              <li>
                <button onClick={() => handleNavigation('/terms')} className="text-muted-foreground hover:text-primary transition-colors text-left">
                  Termat e Shërbimit
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div>
            © 2026 advance.al. Të gjitha të drejtat e rezervuara.
          </div>
          <div>
            Made by{" "}
            <a 
              href="https://jxsoft.al" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              jxsoft.al
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

